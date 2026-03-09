import { z } from 'zod';
import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { BudgetCategoryInput, CreateBudgetDTO, UpdateBudgetDTO } from '../types/budgets.types';

const supabase: any = getSupabaseClient();

const createBudgetSchema = z.object({
  nombre: z.string().min(1).max(120),
  periodo: z.enum(['mensual', 'quincenal', 'semanal', 'unico']),
  dia_inicio: z.number().int().min(1).max(31).optional(),
  ingresos: z.number().min(0).optional(),
  activo: z.boolean().optional(),
  espacio_id: z.number().int().positive().nullable().optional(),
  categorias: z
    .array(
      z.object({
        categoriaId: z.number().int().positive(),
        limite: z.number().positive(),
      }),
    )
    .optional(),
});

const updateBudgetSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  periodo: z.enum(['mensual', 'quincenal', 'semanal', 'unico']).optional(),
  dia_inicio: z.number().int().min(1).max(31).optional(),
  ingresos: z.number().min(0).optional(),
  activo: z.boolean().optional(),
  espacio_id: z.number().int().positive().nullable().optional(),
});

export class BudgetsService {
  async getAll(userId: number) {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('presupuesto_id, usuario_id, espacio_id, nombre, periodo, dia_inicio, ingresos, activo, creado_en, actualizado_en')
      .eq('usuario_id', userId)
      .order('activo', { ascending: false })
      .order('creado_en', { ascending: false });

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar los presupuestos.');

    return data ?? [];
  }

  async getById(userId: number, budgetId: number) {
    const budget = await this.getOwnedBudget(userId, budgetId);
    const categories = await this.getBudgetCategories(budgetId);
    const spending = await this.getSpendingForRange(userId, categories, this.computeDateRange(budget));

    return {
      ...this.mapBudget(budget),
      categorias: spending,
    };
  }

  async create(userId: number, dto: CreateBudgetDTO) {
    const parsed = createBudgetSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    const payload = parsed.data;

    if (payload.activo !== false) {
      await this.deactivateAll(userId);
    }

    const { data, error } = await supabase
      .from('presupuestos')
      .insert({
        usuario_id: userId,
        nombre: payload.nombre.trim(),
        periodo: payload.periodo,
        dia_inicio: payload.dia_inicio ?? 1,
        ingresos: payload.ingresos ?? 0,
        activo: payload.activo ?? true,
        espacio_id: payload.espacio_id ?? null,
      })
      .select('presupuesto_id, usuario_id, espacio_id, nombre, periodo, dia_inicio, ingresos, activo, creado_en, actualizado_en')
      .single();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo crear el presupuesto.');

    if (payload.categorias?.length) {
      await this.replaceCategories(userId, Number(data.presupuesto_id), payload.categorias);
    }

    return this.getById(userId, Number(data.presupuesto_id));
  }

  async update(userId: number, budgetId: number, dto: UpdateBudgetDTO) {
    const parsed = updateBudgetSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    const payload = parsed.data;

    await this.getOwnedBudget(userId, budgetId);

    if (payload.activo === true) {
      await this.deactivateAll(userId);
    }

    const updateData: Record<string, unknown> = {};
    if (payload.nombre !== undefined) updateData.nombre = payload.nombre.trim();
    if (payload.periodo !== undefined) updateData.periodo = payload.periodo;
    if (payload.dia_inicio !== undefined) updateData.dia_inicio = payload.dia_inicio;
    if (payload.ingresos !== undefined) updateData.ingresos = payload.ingresos;
    if (payload.activo !== undefined) updateData.activo = payload.activo;
    if (payload.espacio_id !== undefined) updateData.espacio_id = payload.espacio_id;
    updateData.actualizado_en = new Date().toISOString();

    const { error } = await supabase
      .from('presupuestos')
      .update(updateData)
      .eq('presupuesto_id', budgetId)
      .eq('usuario_id', userId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el presupuesto.');

    return this.getById(userId, budgetId);
  }

  async delete(userId: number, budgetId: number): Promise<void> {
    await this.getOwnedBudget(userId, budgetId);
    const { error } = await supabase
      .from('presupuestos')
      .delete()
      .eq('presupuesto_id', budgetId)
      .eq('usuario_id', userId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo eliminar el presupuesto.');
  }

  async setActive(userId: number, budgetId: number): Promise<void> {
    await this.getOwnedBudget(userId, budgetId);
    await this.deactivateAll(userId);

    const { error } = await supabase
      .from('presupuestos')
      .update({ activo: true, actualizado_en: new Date().toISOString() })
      .eq('presupuesto_id', budgetId)
      .eq('usuario_id', userId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo activar el presupuesto.');
  }

  async getSpending(userId: number, budgetId: number) {
    const budget = await this.getOwnedBudget(userId, budgetId);
    const categories = await this.getBudgetCategories(budgetId);
    return this.getSpendingForRange(userId, categories, this.computeDateRange(budget));
  }

  async addCategoryLimit(userId: number, budgetId: number, categoriaId: number, limite: number) {
    await this.getOwnedBudget(userId, budgetId);
    await this.ensureCategoryVisible(userId, categoriaId);
    if (limite <= 0) throw new BadRequestError('VALIDACION_ERROR', 'El límite debe ser mayor que 0.');

    const { error } = await supabase.from('presupuesto_categorias').upsert({
      presupuesto_id: budgetId,
      categoria_id: categoriaId,
      limite,
    });
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo guardar el límite de categoría.');
  }

  async updateCategoryLimit(userId: number, budgetId: number, categoriaId: number, limite: number) {
    await this.getOwnedBudget(userId, budgetId);
    if (limite <= 0) throw new BadRequestError('VALIDACION_ERROR', 'El límite debe ser mayor que 0.');

    const { error } = await supabase
      .from('presupuesto_categorias')
      .update({ limite })
      .eq('presupuesto_id', budgetId)
      .eq('categoria_id', categoriaId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el límite de categoría.');
  }

  async removeCategoryLimit(userId: number, budgetId: number, categoriaId: number) {
    await this.getOwnedBudget(userId, budgetId);
    const { error } = await supabase
      .from('presupuesto_categorias')
      .delete()
      .eq('presupuesto_id', budgetId)
      .eq('categoria_id', categoriaId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo eliminar el límite de categoría.');
  }

  private async replaceCategories(userId: number, budgetId: number, categorias: BudgetCategoryInput[]) {
    const dedupMap = new Map<number, number>();
    for (const item of categorias) {
      if (item.limite <= 0) {
        throw new BadRequestError('VALIDACION_ERROR', 'Todos los límites deben ser mayores que 0.');
      }
      dedupMap.set(item.categoriaId, item.limite);
    }

    for (const categoriaId of dedupMap.keys()) {
      await this.ensureCategoryVisible(userId, categoriaId);
    }

    const rows = Array.from(dedupMap.entries()).map(([categoriaId, limite]) => ({
      presupuesto_id: budgetId,
      categoria_id: categoriaId,
      limite,
    }));

    const { error: deleteError } = await supabase
      .from('presupuesto_categorias')
      .delete()
      .eq('presupuesto_id', budgetId);
    if (deleteError) throw new BadRequestError('DB_ERROR', 'No se pudieron actualizar las categorías del presupuesto.');

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('presupuesto_categorias').insert(rows);
      if (insertError) throw new BadRequestError('DB_ERROR', 'No se pudieron guardar las categorías del presupuesto.');
    }
  }

  private async getOwnedBudget(userId: number, budgetId: number) {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('presupuesto_id, usuario_id, espacio_id, nombre, periodo, dia_inicio, ingresos, activo, creado_en, actualizado_en')
      .eq('presupuesto_id', budgetId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar el presupuesto.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Presupuesto no encontrado.');
    return data;
  }

  private async getBudgetCategories(budgetId: number) {
    const { data, error } = await supabase
      .from('presupuesto_categorias')
      .select('categoria_id, limite, categorias(categoria_id, slug, nombre, icono, color_hex, tipo)')
      .eq('presupuesto_id', budgetId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las categorías del presupuesto.');
    return data ?? [];
  }

  private async ensureCategoryVisible(userId: number, categoriaId: number) {
    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id, usuario_id, es_sistema')
      .eq('categoria_id', categoriaId)
      .or(`es_sistema.eq.true,usuario_id.eq.${userId}`)
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar categoría.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Categoría no encontrada.');
  }

  private async deactivateAll(userId: number) {
    const { error } = await supabase
      .from('presupuestos')
      .update({ activo: false, actualizado_en: new Date().toISOString() })
      .eq('usuario_id', userId)
      .eq('activo', true);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el presupuesto activo.');
  }

  private computeDateRange(budget: any) {
    const now = new Date();
    const day = Number(budget.dia_inicio) || 1;
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();

    if (budget.periodo === 'mensual') {
      const start = new Date(Date.UTC(currentYear, currentMonth, Math.min(day, 28)));
      const end = new Date(Date.UTC(currentYear, currentMonth + 1, 0));
      return { desde: this.isoDate(start), hasta: this.isoDate(end) };
    }

    if (budget.periodo === 'quincenal') {
      const start = new Date(Date.UTC(currentYear, currentMonth, Math.min(day, 28)));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 14);
      return { desde: this.isoDate(start), hasta: this.isoDate(end) };
    }

    if (budget.periodo === 'semanal') {
      const start = new Date(now);
      start.setUTCDate(now.getUTCDate() - 6);
      return { desde: this.isoDate(start), hasta: this.isoDate(now) };
    }

    // unico: desde creación hasta hoy
    const created = new Date(budget.creado_en);
    return { desde: this.isoDate(created), hasta: this.isoDate(now) };
  }

  private async getSpendingForRange(userId: number, categories: any[], range: { desde: string; hasta: string }) {
    const categoryIds = categories.map((c) => c.categoria_id);
    if (!categoryIds.length) return [];

    const { data, error } = await supabase
      .from('transacciones')
      .select('categoria_id, monto')
      .eq('usuario_id', userId)
      .eq('tipo', 'gasto')
      .gte('fecha', range.desde)
      .lte('fecha', range.hasta)
      .in('categoria_id', categoryIds);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo calcular el gasto por categoría.');

    const spentMap = new Map<number, number>();
    for (const row of data ?? []) {
      const key = Number(row.categoria_id);
      const current = spentMap.get(key) ?? 0;
      spentMap.set(key, current + Number(row.monto));
    }

    return categories.map((row: any) => {
      const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
      const gastado = spentMap.get(Number(row.categoria_id)) ?? 0;
      const limite = Number(row.limite);
      return {
        categoriaId: Number(row.categoria_id),
        slug: cat?.slug ?? null,
        nombre: cat?.nombre ?? null,
        icono: cat?.icono ?? null,
        color_hex: cat?.color_hex ?? null,
        tipo: cat?.tipo ?? null,
        limite,
        gastado,
        restante: Math.max(0, limite - gastado),
        porcentajeUsado: limite > 0 ? (gastado / limite) * 100 : 0,
      };
    });
  }

  private mapBudget(row: any) {
    return {
      id: Number(row.presupuesto_id),
      nombre: row.nombre,
      periodo: row.periodo,
      dia_inicio: Number(row.dia_inicio),
      ingresos: Number(row.ingresos),
      activo: !!row.activo,
      espacio_id: row.espacio_id ? Number(row.espacio_id) : null,
      creado_en: row.creado_en,
      actualizado_en: row.actualizado_en,
    };
  }

  private isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}

