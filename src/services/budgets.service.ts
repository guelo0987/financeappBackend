import { z } from 'zod';
import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { EmailService } from './email.service';
import {
  BudgetCategoryInput,
  BudgetIncomeInput,
  CreateBudgetDTO,
  UpdateBudgetDTO,
} from '../types/budgets.types';

const supabase: any = getSupabaseClient();
const emailService = new EmailService();

const createBudgetSchema = z.object({
  nombre: z.string().min(1).max(120),
  periodo: z.enum(['mensual', 'quincenal', 'semanal', 'unico']),
  dia_inicio: z.number().int().min(1).max(31).optional(),
  ingresos: z.number().min(0).optional(),
  ahorro_objetivo: z.number().min(0).optional(),
  activo: z.boolean().optional(),
  categorias: z
    .array(
      z.object({
        categoriaId: z.number().int().positive(),
        limite: z.number().positive(),
      }),
    )
    .optional(),
  ingresos_detalle: z
    .array(
      z.object({
        categoriaId: z.number().int().positive(),
        monto: z.number().positive(),
      }),
    )
    .optional(),
  invitados: z
    .array(z.string().email())
    .max(3, 'Un presupuesto puede tener máximo 3 colaboradores adicionales.')
    .optional(),
});

const updateBudgetSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  periodo: z.enum(['mensual', 'quincenal', 'semanal', 'unico']).optional(),
  dia_inicio: z.number().int().min(1).max(31).optional(),
  ingresos: z.number().min(0).optional(),
  ahorro_objetivo: z.number().min(0).optional(),
  activo: z.boolean().optional(),
  categorias: z
    .array(
      z.object({
        categoriaId: z.number().int().positive(),
        limite: z.number().positive(),
      }),
    )
    .optional(),
  ingresos_detalle: z
    .array(
      z.object({
        categoriaId: z.number().int().positive(),
        monto: z.number().positive(),
      }),
    )
    .optional(),
});

export class BudgetsService {
  async getAll(userId: number) {
    const spaceIds = await this.getMembershipSpaceIds(userId);
    const selectFields =
      'presupuesto_id, usuario_id, espacio_id, nombre, periodo, dia_inicio, ingresos, ahorro_objetivo, activo, creado_en, actualizado_en';

    let query = supabase.from('presupuestos').select(selectFields);
    if (spaceIds.length > 0) {
      query = query.or(`usuario_id.eq.${userId},espacio_id.in.(${spaceIds.join(',')})`);
    } else {
      query = query.eq('usuario_id', userId);
    }

    const { data, error } = await query
      .order('activo', { ascending: false })
      .order('creado_en', { ascending: false });

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar los presupuestos.');

    const map = new Map<number, any>();
    for (const row of data ?? []) map.set(Number(row.presupuesto_id), row);
    return Array.from(map.values());
  }

  async getById(userId: number, budgetId: number) {
    const budget = await this.getAccessibleBudget(userId, budgetId);
    const categories = await this.getBudgetCategories(budgetId);
    const range = this.computeDateRange(budget);
    const spending = await this.getSpendingForRange(userId, budget, categories, range);
    const otrosGastos = await this.getUnplannedSpending(userId, budget, categories.map((c: any) => Number(c.categoria_id)), range);
    const ingresosDetalle = await this.getBudgetIncomePlan(userId, budget);
    const ingresosActuales = await this.getIncomeForRange(userId, budget, ingresosDetalle, range);

    const totalGastadoPlan = spending.reduce((sum, c) => sum + c.gastado, 0);
    const totalGastadoOtros = otrosGastos.reduce((sum, c) => sum + c.gastado, 0);

    return {
      ...this.mapBudget(budget),
      ingresos_detalle: ingresosDetalle,
      ingresos_actuales: ingresosActuales,
      categorias: spending,
      otros_gastos: otrosGastos,
      total_gastado_real: totalGastadoPlan + totalGastadoOtros,
    };
  }

  async create(userId: number, dto: CreateBudgetDTO) {
    const parsed = createBudgetSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    const payload = parsed.data;

    if (payload.activo !== false) {
      await this.deactivateAll(userId);
    }

    if (payload.ingresos_detalle?.length) {
      for (const item of payload.ingresos_detalle) {
        await this.ensureCategoryVisible(userId, item.categoriaId);
      }
    }

    const plannedIncomeTotal = payload.ingresos_detalle?.length
      ? payload.ingresos_detalle.reduce((sum, item) => sum + item.monto, 0)
      : payload.ingresos ?? 0;

    const { data, error } = await supabase
      .from('presupuestos')
      .insert({
        usuario_id: userId,
        nombre: payload.nombre.trim(),
        periodo: payload.periodo,
        dia_inicio: payload.dia_inicio ?? 1,
        ingresos: plannedIncomeTotal,
        ahorro_objetivo: payload.ahorro_objetivo ?? 0,
        activo: payload.activo ?? true,
      })
      .select(
        'presupuesto_id, usuario_id, espacio_id, nombre, periodo, dia_inicio, ingresos, ahorro_objetivo, activo, creado_en, actualizado_en',
      )
      .single();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo crear el presupuesto.');

    const budgetId = Number(data.presupuesto_id);

    if (payload.categorias?.length) {
      await this.replaceCategories(userId, budgetId, payload.categorias);
    }
    if (payload.ingresos_detalle?.length) {
      await this.replaceIncomeDetails(userId, budgetId, payload.ingresos_detalle);
    }

    if (payload.invitados?.length) {
      const espacioId = await this.ensureBudgetHasSpace(userId, budgetId, payload.nombre.trim());
      const { data: inviter } = await supabase.from('usuarios').select('nombre').eq('usuario_id', userId).single();
      for (const email of payload.invitados) {
        await this.sendInvitation(userId, budgetId, espacioId, email, inviter?.nombre ?? 'Alguien', payload.nombre.trim());
      }
    }

    return this.getById(userId, budgetId);
  }

  async update(userId: number, budgetId: number, dto: UpdateBudgetDTO) {
    const parsed = updateBudgetSchema.safeParse(dto);
    if (!parsed.success) throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    const payload = parsed.data;

    const budget = await this.getAccessibleBudget(userId, budgetId);
    await this.assertBudgetEditAccess(userId, budget);

    if (payload.categorias?.length) {
      await Promise.all(payload.categorias.map((item) => this.ensureCategoryVisible(userId, item.categoriaId)));
    }
    if (payload.ingresos_detalle?.length) {
      await Promise.all(payload.ingresos_detalle.map((item) => this.ensureCategoryVisible(userId, item.categoriaId)));
    }

    if (payload.activo === true) {
      await this.deactivateAll(userId);
    }

    const updateData: Record<string, unknown> = {};
    if (payload.nombre !== undefined) updateData.nombre = payload.nombre.trim();
    if (payload.periodo !== undefined) updateData.periodo = payload.periodo;
    if (payload.dia_inicio !== undefined) updateData.dia_inicio = payload.dia_inicio;
    if (payload.ingresos !== undefined) updateData.ingresos = payload.ingresos;
    if (payload.ahorro_objetivo !== undefined) updateData.ahorro_objetivo = payload.ahorro_objetivo;
    if (payload.activo !== undefined) updateData.activo = payload.activo;
    updateData.actualizado_en = new Date().toISOString();

    if (payload.ingresos_detalle !== undefined) {
      const sum = payload.ingresos_detalle.reduce((acc, item) => acc + item.monto, 0);
      updateData.ingresos = sum;
    }

    const { error } = await supabase
      .from('presupuestos')
      .update(updateData)
      .eq('presupuesto_id', budgetId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el presupuesto.');

    if (payload.categorias !== undefined) {
      await this.replaceCategories(userId, budgetId, payload.categorias);
    }
    if (payload.ingresos_detalle !== undefined) {
      await this.replaceIncomeDetails(userId, budgetId, payload.ingresos_detalle);
    }

    return this.getById(userId, budgetId);
  }

  async delete(userId: number, budgetId: number): Promise<void> {
    const budget = await this.getAccessibleBudget(userId, budgetId);
    await this.assertBudgetAdminAccess(userId, budget);
    const { error } = await supabase
      .from('presupuestos')
      .delete()
      .eq('presupuesto_id', budgetId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo eliminar el presupuesto.');
  }

  async setActive(userId: number, budgetId: number): Promise<void> {
    const budget = await this.getAccessibleBudget(userId, budgetId);
    await this.assertBudgetAdminAccess(userId, budget);
    await this.deactivateAll(userId);

    const { error } = await supabase
      .from('presupuestos')
      .update({ activo: true, actualizado_en: new Date().toISOString() })
      .eq('presupuesto_id', budgetId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo activar el presupuesto.');
  }

  async getSpending(userId: number, budgetId: number) {
    const budget = await this.getAccessibleBudget(userId, budgetId);
    const categories = await this.getBudgetCategories(budgetId);
    const range = this.computeDateRange(budget);
    const categorias = await this.getSpendingForRange(userId, budget, categories, range);
    const otros_gastos = await this.getUnplannedSpending(userId, budget, categories.map((c: any) => Number(c.categoria_id)), range);
    const total_gastado_real = categorias.reduce((sum, c) => sum + c.gastado, 0) + otros_gastos.reduce((sum, c) => sum + c.gastado, 0);
    return { categorias, otros_gastos, total_gastado_real };
  }

  async addCategoryLimit(userId: number, budgetId: number, categoriaId: number, limite: number) {
    const budget = await this.getAccessibleBudget(userId, budgetId);
    await this.assertBudgetEditAccess(userId, budget);
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
    const budget = await this.getAccessibleBudget(userId, budgetId);
    await this.assertBudgetEditAccess(userId, budget);
    if (limite <= 0) throw new BadRequestError('VALIDACION_ERROR', 'El límite debe ser mayor que 0.');

    const { error } = await supabase
      .from('presupuesto_categorias')
      .update({ limite })
      .eq('presupuesto_id', budgetId)
      .eq('categoria_id', categoriaId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el límite de categoría.');
  }

  async removeCategoryLimit(userId: number, budgetId: number, categoriaId: number) {
    const budget = await this.getAccessibleBudget(userId, budgetId);
    await this.assertBudgetEditAccess(userId, budget);
    const { error } = await supabase
      .from('presupuesto_categorias')
      .delete()
      .eq('presupuesto_id', budgetId)
      .eq('categoria_id', categoriaId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo eliminar el límite de categoría.');
  }

  private async sendInvitation(
    userId: number,
    budgetId: number,
    espacioId: number,
    email: string,
    inviterName: string,
    budgetNombre: string,
  ) {
    const normalizedEmail = email.toLowerCase().trim();

    const { data: existingUser } = await supabase
      .from('usuarios')
      .select('usuario_id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      const { data: alreadyMember } = await supabase
        .from('espacio_miembros')
        .select('usuario_id')
        .eq('espacio_id', espacioId)
        .eq('usuario_id', Number(existingUser.usuario_id))
        .maybeSingle();
      if (alreadyMember) {
        throw new ConflictError('ALREADY_MEMBER', `El usuario ${normalizedEmail} ya es miembro del presupuesto.`);
      }
    }

    const { data: existingInvite } = await supabase
      .from('espacio_invitaciones')
      .select('invitacion_id, token')
      .eq('espacio_id', espacioId)
      .eq('email_invitado', normalizedEmail)
      .eq('estado', 'pendiente')
      .gte('expira_en', new Date().toISOString())
      .maybeSingle();

    if (existingInvite) {
      const renewedExpiration = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const { error: renewError } = await supabase
        .from('espacio_invitaciones')
        .update({ expira_en: renewedExpiration })
        .eq('invitacion_id', Number(existingInvite.invitacion_id));

      if (renewError) {
        throw new BadRequestError('DB_ERROR', `No se pudo renovar la invitación para ${normalizedEmail}.`);
      }

      try {
        await emailService.sendBudgetInvitation(
          normalizedEmail,
          inviterName,
          budgetNombre,
          existingInvite.token,
        );
      } catch (emailError) {
        console.error(`Email fallido para ${normalizedEmail}:`, emailError);
        throw new BadRequestError('EMAIL_ERROR', `No se pudo reenviar el correo de invitación a ${normalizedEmail}.`);
      }

      return;
    }

    const { data: invite, error: inviteError } = await supabase
      .from('espacio_invitaciones')
      .insert({ espacio_id: espacioId, invitado_por: userId, email_invitado: normalizedEmail })
      .select('invitacion_id, token')
      .single();

    if (inviteError) throw new BadRequestError('DB_ERROR', `No se pudo crear la invitación para ${normalizedEmail}.`);

    try {
      await emailService.sendBudgetInvitation(normalizedEmail, inviterName, budgetNombre, invite.token);
    } catch (emailError) {
      // Rollback: delete the invitation so it doesn't stay orphaned
      await supabase.from('espacio_invitaciones').delete().eq('invitacion_id', Number(invite.invitacion_id));
      console.error(`Email fallido para ${normalizedEmail}:`, emailError);
      throw new BadRequestError('EMAIL_ERROR', `No se pudo enviar el correo de invitación a ${normalizedEmail}.`);
    }

    // Create in-app alert if the invited user already has an account
    if (existingUser) {
      const { error: alertError } = await supabase.from('alertas').insert({
        usuario_id: Number(existingUser.usuario_id),
        tipo: 'invitacion_presupuesto',
        titulo: `${inviterName} te invitó a un presupuesto`,
        cuerpo: `${inviterName} te ha invitado a colaborar en "${budgetNombre}". Acepta la invitación para comenzar.`,
        datos_extra: {
          token: invite.token,
          presupuesto_id: budgetId,
          espacio_id: espacioId,
          invitado_por: inviterName,
          budget_nombre: budgetNombre,
        },
        espacio_id: espacioId,
      });
      if (alertError) console.error('Error creando alerta de invitación:', alertError);
    }
  }

  async listMembers(userId: number, budgetId: number) {
    const budget = await this.getAccessibleBudget(userId, budgetId);

    if (!budget.espacio_id) return [];

    const { data, error } = await supabase
      .from('espacio_miembros')
      .select('usuario_id, rol, unido_en, usuarios(usuario_id, nombre, email)')
      .eq('espacio_id', Number(budget.espacio_id))
      .order('unido_en', { ascending: true });

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar los miembros.');

    return (data ?? []).map((row: any) => {
      const user = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
      return {
        usuario_id: Number(row.usuario_id),
        rol: row.rol,
        es_propietario: Number(row.usuario_id) === Number(budget.usuario_id),
        unido_en: row.unido_en,
        nombre: user?.nombre ?? null,
        email: user?.email ?? null,
      };
    });
  }

  async inviteMember(userId: number, budgetId: number, email: string) {
    const budget = await this.getAccessibleBudget(userId, budgetId);
    await this.assertBudgetAdminAccess(userId, budget);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestError('VALIDACION_ERROR', 'El email es inválido.');
    }

    // Check current member count (max 4 = owner + 3)
    if (budget.espacio_id) {
      const { count } = await supabase
        .from('espacio_miembros')
        .select('usuario_id', { count: 'exact', head: true })
        .eq('espacio_id', Number(budget.espacio_id));

      if ((count ?? 0) >= 4) {
        throw new BadRequestError('LIMITE_MIEMBROS', 'El presupuesto ya alcanzó el límite de 4 miembros.');
      }
    }

    const espacioId = await this.ensureBudgetHasSpace(userId, budgetId, budget.nombre);
    const { data: inviter } = await supabase.from('usuarios').select('nombre').eq('usuario_id', userId).single();
    await this.sendInvitation(userId, budgetId, espacioId, email, inviter?.nombre ?? 'Alguien', budget.nombre);

    return { invitado: email };
  }

  async removeMember(userId: number, budgetId: number, targetUserId: number) {
    const budget = await this.getAccessibleBudget(userId, budgetId);
    await this.assertBudgetAdminAccess(userId, budget);

    if (!budget.espacio_id) {
      throw new NotFoundError('NOT_FOUND', 'Este presupuesto no tiene miembros compartidos.');
    }

    const espacioId = Number(budget.espacio_id);

    if (targetUserId === Number(budget.usuario_id)) {
      throw new BadRequestError('VALIDACION_ERROR', 'No puedes remover al propietario del presupuesto.');
    }

    const { data: member, error: memberError } = await supabase
      .from('espacio_miembros')
      .select('usuario_id')
      .eq('espacio_id', espacioId)
      .eq('usuario_id', targetUserId)
      .maybeSingle();

    if (memberError) throw new BadRequestError('DB_ERROR', 'No se pudo validar miembro.');
    if (!member) throw new NotFoundError('NOT_FOUND', 'Miembro no encontrado en este presupuesto.');

    const { error } = await supabase
      .from('espacio_miembros')
      .delete()
      .eq('espacio_id', espacioId)
      .eq('usuario_id', targetUserId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo remover el miembro.');
  }

  private async ensureBudgetHasSpace(userId: number, budgetId: number, budgetNombre: string): Promise<number> {
    // If budget already has a space, reuse it
    const { data: existing } = await supabase
      .from('presupuestos')
      .select('espacio_id')
      .eq('presupuesto_id', budgetId)
      .maybeSingle();

    if (existing?.espacio_id) return Number(existing.espacio_id);

    // Create new shared space
    const { data: space, error: spaceError } = await supabase
      .from('espacios_compartidos')
      .insert({ nombre: budgetNombre, creado_por: userId })
      .select('espacio_id')
      .single();

    if (spaceError) throw new BadRequestError('DB_ERROR', 'No se pudo inicializar el espacio compartido.');

    const espacioId = Number(space.espacio_id);

    await supabase.from('espacio_miembros').insert({ espacio_id: espacioId, usuario_id: userId, rol: 'admin' });
    await supabase.from('presupuestos').update({ espacio_id: espacioId }).eq('presupuesto_id', budgetId);

    return espacioId;
  }

  private async replaceCategories(userId: number, budgetId: number, categorias: BudgetCategoryInput[]) {
    const dedupMap = new Map<number, number>();
    for (const item of categorias) {
      if (item.limite <= 0) {
        throw new BadRequestError('VALIDACION_ERROR', 'Todos los límites deben ser mayores que 0.');
      }
      dedupMap.set(item.categoriaId, item.limite);
    }

    await Promise.all(Array.from(dedupMap.keys()).map((id) => this.ensureCategoryVisible(userId, id)));

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

  private async getAccessibleBudget(userId: number, budgetId: number) {
    const { data, error } = await supabase
      .from('presupuestos')
      .select(
        'presupuesto_id, usuario_id, espacio_id, nombre, periodo, dia_inicio, ingresos, ahorro_objetivo, activo, creado_en, actualizado_en',
      )
      .eq('presupuesto_id', budgetId)
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar el presupuesto.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Presupuesto no encontrado.');
    if (Number(data.usuario_id) === userId) return data;
    if (data.espacio_id) {
      await this.assertSpaceMembership(userId, Number(data.espacio_id));
      return data;
    }
    throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'No tiene acceso al presupuesto indicado.');
  }

  private async getBudgetCategories(budgetId: number) {
    const { data, error } = await supabase
      .from('presupuesto_categorias')
      .select('categoria_id, limite, categorias(categoria_id, categoria_padre_id, slug, nombre, tipo, icono, color_hex)')
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
    if (!data) throw new NotFoundError('NOT_FOUND', 'Categoría no encontrada o no pertenece al usuario.');
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
    const todayDay = now.getUTCDate();
    const day = Math.min(Number(budget.dia_inicio) || 1, 28);
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();

    if (budget.periodo === 'mensual') {
      // If dia_inicio is in the future this month, use the previous period
      // e.g. dia_inicio=25, today=10 → period is 25th of last month to today's month end
      let startYear = currentYear;
      let startMonth = currentMonth;
      if (day > todayDay) {
        startMonth -= 1;
        if (startMonth < 0) { startMonth = 11; startYear -= 1; }
      }
      const start = new Date(Date.UTC(startYear, startMonth, day));
      const end = new Date(Date.UTC(startYear, startMonth + 1, day - 1));
      return { desde: this.isoDate(start), hasta: this.isoDate(end) };
    }

    if (budget.periodo === 'quincenal') {
      let startYear = currentYear;
      let startMonth = currentMonth;
      if (day > todayDay) {
        startMonth -= 1;
        if (startMonth < 0) { startMonth = 11; startYear -= 1; }
      }
      const start = new Date(Date.UTC(startYear, startMonth, day));
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

  private async getSpendingForRange(
    userId: number,
    budget: any,
    categories: any[],
    range: { desde: string; hasta: string },
  ) {
    const categoryIds = categories.map((c) => c.categoria_id);
    if (!categoryIds.length) return [];

    let txQuery = supabase
      .from('transacciones')
      .select('categoria_id, monto')
      .eq('presupuesto_id', Number(budget.presupuesto_id))
      .eq('tipo', 'gasto')
      .gte('fecha', range.desde)
      .lte('fecha', range.hasta)
      .in('categoria_id', categoryIds);

    if (budget.espacio_id) {
      txQuery = txQuery.eq('espacio_id', Number(budget.espacio_id));
    } else {
      txQuery = txQuery.eq('usuario_id', userId).is('espacio_id', null);
    }

    const { data, error } = await txQuery;

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
        categoria_padre_id: cat?.categoria_padre_id ? Number(cat.categoria_padre_id) : null,
        slug: cat?.slug ?? null,
        nombre: cat?.nombre ?? null,
        tipo: cat?.tipo ?? null,
        icono: cat?.icono ?? null,
        color_hex: cat?.color_hex ?? null,
        limite,
        gastado,
        restante: Math.max(0, limite - gastado),
        porcentajeUsado: limite > 0 ? (gastado / limite) * 100 : 0,
      };
    });
  }

  private async getUnplannedSpending(
    userId: number,
    budget: any,
    plannedCategoryIds: number[],
    range: { desde: string; hasta: string },
  ) {
    let txQuery = supabase
      .from('transacciones')
      .select('categoria_id, monto, categorias(categoria_id, categoria_padre_id, slug, nombre, tipo, icono, color_hex)')
      .eq('presupuesto_id', Number(budget.presupuesto_id))
      .eq('tipo', 'gasto')
      .gte('fecha', range.desde)
      .lte('fecha', range.hasta);

    if (plannedCategoryIds.length > 0) {
      txQuery = txQuery.not('categoria_id', 'in', `(${plannedCategoryIds.join(',')})`);
    }

    if (budget.espacio_id) {
      txQuery = txQuery.eq('espacio_id', Number(budget.espacio_id));
    } else {
      txQuery = txQuery.eq('usuario_id', userId).is('espacio_id', null);
    }

    const { data, error } = await txQuery;
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar los gastos fuera del plan.');

    const spentMap = new Map<number, { gastado: number; cat: any }>();
    for (const row of data ?? []) {
      const catId = Number(row.categoria_id);
      const existing = spentMap.get(catId);
      const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
      spentMap.set(catId, {
        gastado: (existing?.gastado ?? 0) + Number(row.monto),
        cat: existing?.cat ?? cat,
      });
    }

    return Array.from(spentMap.entries()).map(([catId, { gastado, cat }]) => ({
      categoriaId: catId,
      categoria_padre_id: cat?.categoria_padre_id ? Number(cat.categoria_padre_id) : null,
      slug: cat?.slug ?? null,
      nombre: cat?.nombre ?? null,
      tipo: cat?.tipo ?? null,
      icono: cat?.icono ?? null,
      color_hex: cat?.color_hex ?? null,
      gastado,
    }));
  }

  private async replaceIncomeDetails(
    userId: number,
    budgetId: number,
    ingresosDetalle: BudgetIncomeInput[],
  ) {
    const dedup = new Map<number, number>();
    for (const item of ingresosDetalle) {
      if (item.monto <= 0) {
        throw new BadRequestError('VALIDACION_ERROR', 'Todos los montos de ingresos deben ser mayores que 0.');
      }
      dedup.set(item.categoriaId, item.monto);
    }

    await Promise.all(Array.from(dedup.keys()).map((id) => this.ensureCategoryVisible(userId, id)));

    const rows = Array.from(dedup.entries()).map(([categoriaId, monto_planeado]) => ({
      presupuesto_id: budgetId,
      categoria_id: categoriaId,
      monto_planeado,
    }));

    const { error: deleteError } = await supabase
      .from('presupuesto_ingresos')
      .delete()
      .eq('presupuesto_id', budgetId);
    if (deleteError) {
      throw new BadRequestError(
        'DB_ERROR',
        'No se pudieron actualizar las fuentes de ingreso del presupuesto.',
      );
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('presupuesto_ingresos').insert(rows);
      if (insertError) {
        throw new BadRequestError(
          'DB_ERROR',
          'No se pudieron guardar las fuentes de ingreso del presupuesto.',
        );
      }
    }
  }

  private async getBudgetIncomePlan(userId: number, budget: any) {
    const budgetId = Number(budget.presupuesto_id);
    const { data, error } = await supabase
      .from('presupuesto_ingresos')
      .select('categoria_id, monto_planeado, categorias(categoria_id, categoria_padre_id, slug, nombre, tipo, icono, color_hex)')
      .eq('presupuesto_id', budgetId);

    if (error) {
      throw new BadRequestError(
        'DB_ERROR',
        'No se pudieron cargar las fuentes de ingreso del presupuesto.',
      );
    }

    if ((data ?? []).length > 0) {
      return (data ?? []).map((row: any) => {
        const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
        return {
          categoriaId: Number(row.categoria_id),
          categoria_padre_id: cat?.categoria_padre_id ? Number(cat.categoria_padre_id) : null,
          slug: cat?.slug ?? null,
          nombre: cat?.nombre ?? null,
          tipo: cat?.tipo ?? null,
          icono: cat?.icono ?? null,
          color_hex: cat?.color_hex ?? null,
          monto_planeado: Number(row.monto_planeado),
        };
      });
    }

    if (Number(budget.ingresos) > 0) {
      return [
        {
          categoriaId: null,
          categoria_padre_id: null,
          slug: null,
          nombre: 'Ingresos generales',
          tipo: 'ingreso' as const,
          icono: null,
          color_hex: null,
          monto_planeado: Number(budget.ingresos),
        },
      ];
    }

    return [];
  }

  private async getIncomeForRange(
    userId: number,
    budget: any,
    incomePlan: Array<{ categoriaId: number | null; monto_planeado: number }>,
    range: { desde: string; hasta: string },
  ) {
    const categoryIds = incomePlan
      .map((item) => item.categoriaId)
      .filter((value): value is number => typeof value === 'number');

    const baseQuery = () => {
      let q = supabase
        .from('transacciones')
        .select('categoria_id, monto, categorias(categoria_id, categoria_padre_id, slug, nombre, tipo, icono, color_hex)')
        .eq('presupuesto_id', Number(budget.presupuesto_id))
        .eq('tipo', 'ingreso')
        .gte('fecha', range.desde)
        .lte('fecha', range.hasta);

      if (budget.espacio_id) {
        q = q.eq('espacio_id', Number(budget.espacio_id));
      } else {
        q = q.eq('usuario_id', userId).is('espacio_id', null);
      }
      return q;
    };

    // Planned income transactions
    let plannedQuery = baseQuery();
    if (categoryIds.length > 0) {
      plannedQuery = plannedQuery.in('categoria_id', categoryIds);
    }

    const { data: plannedData, error: plannedError } = await plannedQuery;
    if (plannedError) throw new BadRequestError('DB_ERROR', 'No se pudo calcular ingresos del presupuesto.');

    const actualMap = new Map<number, number>();
    let totalActualPlanned = 0;
    for (const row of plannedData ?? []) {
      const amount = Number(row.monto);
      totalActualPlanned += amount;
      if (row.categoria_id) {
        const key = Number(row.categoria_id);
        actualMap.set(key, (actualMap.get(key) ?? 0) + amount);
      }
    }

    const detalle = incomePlan.map((item) => {
      const actual = item.categoriaId ? actualMap.get(item.categoriaId) ?? 0 : totalActualPlanned;
      return {
        ...item,
        monto_actual: actual,
        diferencia: actual - item.monto_planeado,
      };
    });

    // Unplanned income transactions (categories not in the income plan)
    let otrosIngresosData: any[] = [];
    if (categoryIds.length > 0) {
      let unplannedQuery = baseQuery().not('categoria_id', 'in', `(${categoryIds.join(',')})`);
      const { data: unplannedData, error: unplannedError } = await unplannedQuery;
      if (unplannedError) throw new BadRequestError('DB_ERROR', 'No se pudo calcular ingresos fuera del plan.');

      const unplannedMap = new Map<number, { monto: number; cat: any }>();
      for (const row of unplannedData ?? []) {
        const catId = Number(row.categoria_id);
        const existing = unplannedMap.get(catId);
        const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
        unplannedMap.set(catId, {
          monto: (existing?.monto ?? 0) + Number(row.monto),
          cat: existing?.cat ?? cat,
        });
      }

      otrosIngresosData = Array.from(unplannedMap.entries()).map(([catId, { monto, cat }]) => ({
        categoriaId: catId,
        categoria_padre_id: cat?.categoria_padre_id ? Number(cat.categoria_padre_id) : null,
        slug: cat?.slug ?? null,
        nombre: cat?.nombre ?? null,
        tipo: cat?.tipo ?? null,
        icono: cat?.icono ?? null,
        color_hex: cat?.color_hex ?? null,
        monto_actual: monto,
      }));
    }

    const totalOtrosIngresos = otrosIngresosData.reduce((sum, r) => sum + r.monto_actual, 0);

    return {
      total_planeado: incomePlan.reduce((acc, item) => acc + item.monto_planeado, 0),
      total_actual: totalActualPlanned + totalOtrosIngresos,
      detalle,
      otros_ingresos: otrosIngresosData,
    };
  }

  private mapBudget(row: any) {
    return {
      id: Number(row.presupuesto_id),
      nombre: row.nombre,
      periodo: row.periodo,
      dia_inicio: Number(row.dia_inicio),
      ingresos: Number(row.ingresos),
      ahorro_objetivo: Number(row.ahorro_objetivo ?? 0),
      activo: !!row.activo,
      espacio_id: row.espacio_id ? Number(row.espacio_id) : null,
      creado_en: row.creado_en,
      actualizado_en: row.actualizado_en,
    };
  }

  private isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private async getMembershipSpaceIds(userId: number): Promise<number[]> {
    const { data, error } = await supabase
      .from('espacio_miembros')
      .select('espacio_id')
      .eq('usuario_id', userId);

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar membresías de espacios.');
    }

    return (data ?? []).map((row: any) => Number(row.espacio_id));
  }

  private async assertSpaceMembership(userId: number, spaceId: number): Promise<string> {
    const { data, error } = await supabase
      .from('espacio_miembros')
      .select('rol')
      .eq('espacio_id', spaceId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar membresía del espacio.');
    }
    if (!data) {
      throw new NotFoundError(
        'NOT_FOUND_OR_FORBIDDEN',
        'No tiene acceso al espacio compartido indicado.',
      );
    }

    return String(data.rol ?? 'miembro');
  }

  private async assertBudgetEditAccess(userId: number, budget: any): Promise<void> {
    if (Number(budget.usuario_id) === userId) return;
    if (!budget.espacio_id) {
      throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'No puede modificar este presupuesto.');
    }

    await this.assertSpaceMembership(userId, Number(budget.espacio_id));
  }

  private async assertBudgetAdminAccess(userId: number, budget: any): Promise<void> {
    if (Number(budget.usuario_id) === userId) return;
    if (!budget.espacio_id) {
      throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'No puede administrar este presupuesto.');
    }

    const role = await this.assertSpaceMembership(userId, Number(budget.espacio_id));
    if (role !== 'admin') {
      throw new NotFoundError(
        'NOT_FOUND_OR_FORBIDDEN',
        'Solo admins pueden administrar este presupuesto compartido.',
      );
    }
  }
}
