import { z } from 'zod';
import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { CreateRecurringDTO, UpdateRecurringDTO } from '../types/recurring.types';

const supabase: any = getSupabaseClient();

const createSchema = z.object({
  budgetId: z.number().int().positive().nullable().optional(),
  walletId: z.number().int().positive().nullable().optional(),
  catKey: z.string().min(1).max(80).nullable().optional(),
  tipo: z.enum(['ingreso', 'gasto', 'transferencia']),
  monto: z.number().positive(),
  moneda: z.enum(['DOP', 'USD']).optional(),
  descripcion: z.string().max(255).nullable().optional(),
  nota: z.string().max(500).nullable().optional(),
  frecuencia: z.enum(['mensual', 'quincenal', 'semanal']),
  diaEjecucion: z.number().int().min(1).max(31),
  activo: z.boolean().optional(),
});

const updateSchema = z.object({
  budgetId: z.number().int().positive().nullable().optional(),
  walletId: z.number().int().positive().nullable().optional(),
  catKey: z.string().min(1).max(80).nullable().optional(),
  tipo: z.enum(['ingreso', 'gasto', 'transferencia']).optional(),
  monto: z.number().positive().optional(),
  moneda: z.enum(['DOP', 'USD']).optional(),
  descripcion: z.string().max(255).nullable().optional(),
  nota: z.string().max(500).nullable().optional(),
  frecuencia: z.enum(['mensual', 'quincenal', 'semanal']).optional(),
  diaEjecucion: z.number().int().min(1).max(31).optional(),
  activo: z.boolean().optional(),
});

export class RecurringService {
  async getAll(userId: number, page = 1, limit = 50) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(100, limit));
    const from = (safePage - 1) * safeLimit;
    const to = from + safeLimit - 1;

    const { data, error, count } = await supabase
      .from('transacciones_recurrentes')
      .select(
        'recurrente_id, usuario_id, presupuesto_id, activo_id, categoria_id, tipo, monto, moneda, descripcion, nota, frecuencia, dia_ejecucion, activo, proxima_ejecucion, creado_en, actualizado_en, categorias(slug, nombre, icono)',
        { count: 'exact' },
      )
      .eq('usuario_id', userId)
      .order('activo', { ascending: false })
      .order('creado_en', { ascending: false })
      .range(from, to);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las transacciones recurrentes.');

    const total = count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);
    return {
      data: (data ?? []).map((row: any) => this.mapRecurring(row)),
      meta: { page: safePage, limit: safeLimit, total, totalPages, hasMore: safePage < totalPages },
    };
  }

  async create(userId: number, dto: CreateRecurringDTO) {
    const parsed = createSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    const payload = parsed.data;

    if (payload.budgetId) {
      await this.getAccessibleBudget(userId, payload.budgetId);
    }
    if (payload.walletId) await this.validateWalletOwnership(userId, payload.walletId);
    const categoriaId = await this.resolveCategoryId(userId, payload.catKey ?? null);

    const { data, error } = await supabase
      .from('transacciones_recurrentes')
      .insert({
        usuario_id: userId,
        presupuesto_id: payload.budgetId ?? null,
        activo_id: payload.walletId ?? null,
        categoria_id: categoriaId,
        tipo: payload.tipo,
        monto: payload.monto,
        moneda: payload.moneda ?? 'DOP',
        descripcion: payload.descripcion ?? null,
        nota: payload.nota ?? null,
        frecuencia: payload.frecuencia,
        dia_ejecucion: payload.diaEjecucion,
        activo: payload.activo ?? true,
        proxima_ejecucion: this.computeInitialExecutionDate(payload.frecuencia, payload.diaEjecucion),
      })
      .select(
        'recurrente_id, usuario_id, presupuesto_id, activo_id, categoria_id, tipo, monto, moneda, descripcion, nota, frecuencia, dia_ejecucion, activo, proxima_ejecucion, creado_en, actualizado_en, categorias(slug, nombre, icono)',
      )
      .single();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo crear la transacción recurrente.');
    return this.mapRecurring(data);
  }

  async update(userId: number, id: number, dto: UpdateRecurringDTO) {
    const parsed = updateSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    const payload = parsed.data;
    const existing = await this.getOwnedRecurring(userId, id);
    const nextBudgetId = payload.budgetId !== undefined
      ? payload.budgetId
      : (existing.presupuesto_id ? Number(existing.presupuesto_id) : null);
    if (nextBudgetId) {
      await this.getAccessibleBudget(userId, nextBudgetId);
    }

    const nextWalletId = payload.walletId !== undefined ? payload.walletId : existing.activo_id;
    if (nextWalletId) await this.validateWalletOwnership(userId, Number(nextWalletId));

    let categoriaId: number | null | undefined = undefined;
    if (payload.catKey !== undefined) {
      categoriaId = await this.resolveCategoryId(userId, payload.catKey);
    }

    const updateData: Record<string, unknown> = {};
    if (payload.budgetId !== undefined) updateData.presupuesto_id = payload.budgetId;
    if (payload.walletId !== undefined) updateData.activo_id = payload.walletId;
    if (categoriaId !== undefined) updateData.categoria_id = categoriaId;
    if (payload.tipo !== undefined) updateData.tipo = payload.tipo;
    if (payload.monto !== undefined) updateData.monto = payload.monto;
    if (payload.moneda !== undefined) updateData.moneda = payload.moneda;
    if (payload.descripcion !== undefined) updateData.descripcion = payload.descripcion;
    if (payload.nota !== undefined) updateData.nota = payload.nota;
    if (payload.frecuencia !== undefined) updateData.frecuencia = payload.frecuencia;
    if (payload.diaEjecucion !== undefined) updateData.dia_ejecucion = payload.diaEjecucion;
    if (payload.activo !== undefined) updateData.activo = payload.activo;

    if (payload.frecuencia !== undefined || payload.diaEjecucion !== undefined) {
      updateData.proxima_ejecucion = this.computeNextExecutionDate(
        (payload.frecuencia ?? existing.frecuencia) as string,
        Number(payload.diaEjecucion ?? existing.dia_ejecucion),
      );
    }
    updateData.actualizado_en = new Date().toISOString();

    const { data, error } = await supabase
      .from('transacciones_recurrentes')
      .update(updateData)
      .eq('recurrente_id', id)
      .eq('usuario_id', userId)
      .select(
        'recurrente_id, usuario_id, presupuesto_id, activo_id, categoria_id, tipo, monto, moneda, descripcion, nota, frecuencia, dia_ejecucion, activo, proxima_ejecucion, creado_en, actualizado_en, categorias(slug, nombre, icono)',
      )
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo actualizar la transacción recurrente.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Transacción recurrente no encontrada.');
    return this.mapRecurring(data);
  }

  async toggle(userId: number, id: number) {
    const recurring = await this.getOwnedRecurring(userId, id);
    const nextActive = !recurring.activo;

    const { data, error } = await supabase
      .from('transacciones_recurrentes')
      .update({ activo: nextActive, actualizado_en: new Date().toISOString() })
      .eq('recurrente_id', id)
      .eq('usuario_id', userId)
      .select(
        'recurrente_id, usuario_id, presupuesto_id, activo_id, categoria_id, tipo, monto, moneda, descripcion, nota, frecuencia, dia_ejecucion, activo, proxima_ejecucion, creado_en, actualizado_en, categorias(slug, nombre, icono)',
      )
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el estado.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Transacción recurrente no encontrada.');
    return this.mapRecurring(data);
  }

  async delete(userId: number, id: number): Promise<void> {
    await this.getOwnedRecurring(userId, id);
    const { error } = await supabase
      .from('transacciones_recurrentes')
      .delete()
      .eq('recurrente_id', id)
      .eq('usuario_id', userId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo eliminar la transacción recurrente.');
  }

  async processDueTransactions(userId?: number): Promise<{ processed: number; errors: number }> {
    const today = this.isoDate(new Date());
    let query = supabase
      .from('transacciones_recurrentes')
      .select(
        'recurrente_id, usuario_id, presupuesto_id, activo_id, categoria_id, tipo, monto, moneda, descripcion, nota, frecuencia, dia_ejecucion, activo, proxima_ejecucion',
      )
      .eq('activo', true);

    if (userId) query = query.eq('usuario_id', userId);

    const { data, error } = await query;
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron consultar recurrentes.');

    let processed = 0;
    let errors = 0;

    for (const rec of data ?? []) {
      try {
        if (!this.isDueToday(rec, today)) continue;

        // Skip transferencias — not supported for recurring (no destination wallet)
        if (rec.tipo === 'transferencia') {
          console.error(JSON.stringify({ level: 'warn', msg: '[recurring] skipping transferencia', recurrente_id: rec.recurrente_id }));
          continue;
        }

        const budget = rec.presupuesto_id
          ? await this.getAccessibleBudget(Number(rec.usuario_id), Number(rec.presupuesto_id))
          : null;

        // Idempotency guard: advance proxima_ejecucion FIRST to prevent duplicate execution
        // on concurrent/retry runs. If transaction insert later fails, the recurring is
        // skipped until the next scheduled period (safe outcome, no duplicates).
        const nextDate = this.computeNextExecutionDate(rec.frecuencia, Number(rec.dia_ejecucion), today);
        const { error: advanceError } = await supabase
          .from('transacciones_recurrentes')
          .update({ proxima_ejecucion: nextDate, actualizado_en: new Date().toISOString() })
          .eq('recurrente_id', rec.recurrente_id)
          .eq('proxima_ejecucion', rec.proxima_ejecucion); // optimistic lock: only update if unchanged

        if (advanceError) {
          console.error(JSON.stringify({ level: 'error', msg: '[recurring] advance error', recurrente_id: rec.recurrente_id, error: advanceError.message }));
          errors += 1;
          continue;
        }

        const { error: insertError } = await supabase.from('transacciones').insert({
          usuario_id: rec.usuario_id,
          presupuesto_id: rec.presupuesto_id,
          espacio_id: budget?.espacio_id ? Number(budget.espacio_id) : null,
          activo_id: rec.activo_id ?? null,
          activo_destino_id: null,
          tipo: rec.tipo,
          monto: rec.monto,
          moneda: rec.moneda ?? 'DOP',
          categoria_id: rec.categoria_id ?? null,
          descripcion: rec.descripcion ?? 'Transacción recurrente',
          fecha: today,
          origen: 'recurrente',
          nota: rec.nota ?? null,
        });

        if (insertError) {
          console.error(JSON.stringify({ level: 'error', msg: '[recurring] insert error', recurrente_id: rec.recurrente_id, error: insertError.message }));
          errors += 1;
          continue;
        }

        // Atomic wallet adjustment via RPC
        if (rec.activo_id) {
          const delta = rec.tipo === 'ingreso' ? Number(rec.monto) : -Number(rec.monto);
          await this.applyWalletAdjustment(Number(rec.usuario_id), Number(rec.activo_id), delta);
        }

        processed += 1;
      } catch (err) {
        console.error(JSON.stringify({ level: 'error', msg: '[recurring] exception', recurrente_id: rec.recurrente_id, error: String(err) }));
        errors += 1;
      }
    }

    return { processed, errors };
  }

  private async getOwnedRecurring(userId: number, id: number) {
    const { data, error } = await supabase
      .from('transacciones_recurrentes')
      .select(
        'recurrente_id, usuario_id, presupuesto_id, activo_id, categoria_id, tipo, monto, moneda, descripcion, nota, frecuencia, dia_ejecucion, activo, proxima_ejecucion, creado_en, actualizado_en',
      )
      .eq('recurrente_id', id)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar la transacción recurrente.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Transacción recurrente no encontrada.');
    return data;
  }

  private async resolveCategoryId(userId: number, catKey: string | null): Promise<number | null> {
    if (!catKey) return null;
    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id')
      .eq('slug', catKey)
      .or(`es_sistema.eq.true,usuario_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar la categoría.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Categoría no encontrada.');
    return Number(data.categoria_id);
  }

  private async validateWalletOwnership(userId: number, walletId: number): Promise<void> {
    const { data, error } = await supabase
      .from('activos')
      .select('activo_id')
      .eq('activo_id', walletId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar la cuenta.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Cuenta no encontrada.');
  }

  private isDueToday(rec: any, todayIso: string): boolean {
    if (rec.proxima_ejecucion) {
      return String(rec.proxima_ejecucion) <= todayIso;
    }

    const today = new Date(`${todayIso}T00:00:00.000Z`);
    const day = today.getUTCDate();
    const dow = this.isoWeekday(today);
    const targetDay = Number(rec.dia_ejecucion);

    if (rec.frecuencia === 'mensual') {
      const last = this.daysInMonth(today.getUTCFullYear(), today.getUTCMonth() + 1);
      return day === Math.min(targetDay, last);
    }

    if (rec.frecuencia === 'quincenal') {
      const last = this.daysInMonth(today.getUTCFullYear(), today.getUTCMonth() + 1);
      const d1 = Math.min(targetDay, last);
      const d2 = Math.min(targetDay + 15, last);
      return day === d1 || day === d2;
    }

    const weeklyDay = ((targetDay - 1) % 7) + 1;
    return dow === weeklyDay;
  }

  // Used on CREATE: returns the soonest occurrence including today.
  // If the target day is today or still ahead this period → use current period.
  // If it already passed → use next period.
  private computeInitialExecutionDate(frecuencia: string, diaEjecucion: number): string {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayIso = this.isoDate(today);

    if (frecuencia === 'semanal') {
      const todayDow = this.isoWeekday(today);
      const targetDow = ((diaEjecucion - 1) % 7) + 1;
      let diff = targetDow - todayDow;
      if (diff < 0) diff += 7;          // already passed this week → next week
      const next = new Date(today);
      next.setUTCDate(next.getUTCDate() + diff);
      return this.isoDate(next);
    }

    if (frecuencia === 'quincenal') {
      const day = today.getUTCDate();
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth() + 1;
      const last = this.daysInMonth(year, month);
      const d1 = Math.min(diaEjecucion, last);
      const d2 = Math.min(diaEjecucion + 15, last);
      if (day <= d1) return this.isoDate(new Date(Date.UTC(year, month - 1, d1)));
      if (day <= d2) return this.isoDate(new Date(Date.UTC(year, month - 1, d2)));
      // Both passed this month → first occurrence next month
      const nm = month === 12 ? 1 : month + 1;
      const ny = month === 12 ? year + 1 : year;
      return this.isoDate(new Date(Date.UTC(ny, nm - 1, Math.min(diaEjecucion, this.daysInMonth(ny, nm)))));
    }

    // mensual
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    const last = this.daysInMonth(year, month);
    const targetThisMonth = this.isoDate(new Date(Date.UTC(year, month - 1, Math.min(diaEjecucion, last))));
    if (targetThisMonth >= todayIso) return targetThisMonth;
    // Already passed → next month
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    return this.isoDate(new Date(Date.UTC(ny, nm - 1, Math.min(diaEjecucion, this.daysInMonth(ny, nm)))));
  }

  private computeNextExecutionDate(frecuencia: string, diaEjecucion: number, baseIso?: string): string {
    const base = baseIso ? new Date(`${baseIso}T00:00:00.000Z`) : new Date();
    base.setUTCHours(0, 0, 0, 0);

    if (frecuencia === 'semanal') {
      const todayDow = this.isoWeekday(base);
      const targetDow = ((diaEjecucion - 1) % 7) + 1;
      let diff = targetDow - todayDow;
      if (diff <= 0) diff += 7;
      const next = new Date(base);
      next.setUTCDate(next.getUTCDate() + diff);
      return this.isoDate(next);
    }

    if (frecuencia === 'quincenal') {
      const next = new Date(base);
      next.setUTCDate(next.getUTCDate() + 15);
      return this.isoDate(next);
    }

    const year = base.getUTCFullYear();
    const month = base.getUTCMonth() + 1;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const lastDay = this.daysInMonth(nextYear, nextMonth);
    const date = new Date(Date.UTC(nextYear, nextMonth - 1, Math.min(diaEjecucion, lastDay)));
    return this.isoDate(date);
  }

  private mapRecurring(row: any) {
    const category = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
    return {
      id: Number(row.recurrente_id),
      budgetId: row.presupuesto_id ? Number(row.presupuesto_id) : null,
      walletId: row.activo_id ? Number(row.activo_id) : null,
      categoriaId: row.categoria_id ? Number(row.categoria_id) : null,
      catKey: category?.slug ?? null,
      tipo: row.tipo,
      monto: Number(row.monto),
      moneda: row.moneda,
      descripcion: row.descripcion,
      nota: row.nota,
      frecuencia: row.frecuencia,
      diaEjecucion: Number(row.dia_ejecucion),
      activo: !!row.activo,
      proximaEjecucion: row.proxima_ejecucion,
      creado_en: row.creado_en,
      actualizado_en: row.actualizado_en,
    };
  }

  private isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private isoWeekday(date: Date): number {
    const d = date.getUTCDay();
    return d === 0 ? 7 : d;
  }

  private daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  private async getAccessibleBudget(userId: number, budgetId: number): Promise<any> {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('presupuesto_id, usuario_id, espacio_id')
      .eq('presupuesto_id', budgetId)
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar el presupuesto.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Presupuesto no encontrado.');
    if (Number(data.usuario_id) === userId) return data;
    if (data.espacio_id) {
      const { data: member, error: memberError } = await supabase
        .from('espacio_miembros')
        .select('usuario_id')
        .eq('espacio_id', Number(data.espacio_id))
        .eq('usuario_id', userId)
        .maybeSingle();
      if (memberError) throw new BadRequestError('DB_ERROR', 'No se pudo validar membresía del espacio.');
      if (!member) throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'No tiene acceso al presupuesto.');
      return data;
    }
    throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'No tiene acceso al presupuesto.');
  }

  private async applyWalletAdjustment(userId: number, walletId: number, delta: number): Promise<void> {
    const { error } = await supabase.rpc('adjust_wallet_balance', {
      p_wallet_id: walletId,
      p_user_id: userId,
      p_delta: delta,
    });

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el balance de la cuenta.');
    }
  }
}
