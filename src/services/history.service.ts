import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, NotFoundError } from '../utils/errors';

const supabase: any = getSupabaseClient();

export class HistoryService {
  async getHistory(userId: number, budgetId: number, page = 1, limit = 12) {
    await this.assertAccess(userId, budgetId);

    const offset = (page - 1) * limit;
    const { data, error, count } = await supabase
      .from('presupuesto_historial')
      .select('*', { count: 'exact' })
      .eq('presupuesto_id', budgetId)
      .order('hasta', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo cargar el historial.');

    const total = count ?? 0;
    return {
      data: (data ?? []).map(this.mapHistorial),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
    };
  }

  // Called by the cron job for each budget
  async createSnapshotIfNeeded(
    budgetId: number,
    range: { desde: string; hasta: string },
  ): Promise<boolean> {
    const { data: existing } = await supabase
      .from('presupuesto_historial')
      .select('historial_id')
      .eq('presupuesto_id', budgetId)
      .eq('desde', range.desde)
      .eq('hasta', range.hasta)
      .maybeSingle();

    if (existing) return false;

    await this.createSnapshot(budgetId, range);
    return true;
  }

  // Entry point for the daily cron job
  async processAllBudgets(): Promise<{ processed: number; errors: number }> {
    const { data: budgets, error } = await supabase
      .from('presupuestos')
      .select(
        'presupuesto_id, usuario_id, espacio_id, periodo, dia_inicio, ingresos, ahorro_objetivo, creado_en',
      );

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar presupuestos.');

    let processed = 0;
    let errors = 0;

    for (const budget of budgets ?? []) {
      try {
        const range = this.computePreviousPeriodRange(budget);
        if (!range) continue;

        const created = await this.createSnapshotIfNeeded(Number(budget.presupuesto_id), range);
        if (created) processed++;
      } catch (err) {
        console.error(`[history] Error en presupuesto ${budget.presupuesto_id}:`, err);
        errors++;
      }
    }

    return { processed, errors };
  }

  private async createSnapshot(
    budgetId: number,
    range: { desde: string; hasta: string },
  ): Promise<void> {
    // 1. Get budget config
    const { data: budget } = await supabase
      .from('presupuestos')
      .select(
        'presupuesto_id, usuario_id, espacio_id, periodo, dia_inicio, ingresos, ahorro_objetivo, creado_en',
      )
      .eq('presupuesto_id', budgetId)
      .maybeSingle();

    if (!budget) return;

    // 2. Get planned categories (with limits)
    const { data: catRows } = await supabase
      .from('presupuesto_categorias')
      .select('categoria_id, limite, categorias(slug, nombre, icono, color_hex)')
      .eq('presupuesto_id', budgetId);

    const categories = catRows ?? [];
    const plannedCatIds = new Set(categories.map((c: any) => Number(c.categoria_id)));

    // 3. Get income plan
    const { data: incomeRows } = await supabase
      .from('presupuesto_ingresos')
      .select('categoria_id, monto_planeado, categorias(slug, nombre, icono, color_hex)')
      .eq('presupuesto_id', budgetId);

    const incomePlan = incomeRows ?? [];
    const plannedIncomeIds = new Set(
      incomePlan.map((r: any) => Number(r.categoria_id)).filter(Boolean),
    );

    // 4. Get ALL transactions in the period (one query)
    const { data: txRows } = await supabase
      .from('transacciones')
      .select(
        'transaccion_id, tipo, monto, moneda, descripcion, fecha, categoria_id, categorias(slug, nombre, icono), usuarios(nombre)',
      )
      .eq('presupuesto_id', budgetId)
      .gte('fecha', range.desde)
      .lte('fecha', range.hasta)
      .order('fecha', { ascending: false });

    const txs: any[] = txRows ?? [];

    // 5. Aggregate spending and income per category
    const gastoPorCat = new Map<number, number>();
    const ingresoPorCat = new Map<number, number>();
    let total_gastos = 0;
    let total_ingresos = 0;

    // Build transaction list for JSONB storage (exclude transferencias)
    const transacciones = txs
      .filter((row) => row.tipo !== 'transferencia')
      .map((row: any) => {
        const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
        const usr = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
        const monto = Number(row.monto);
        const catId = row.categoria_id ? Number(row.categoria_id) : null;

        if (row.tipo === 'gasto') {
          total_gastos += monto;
          if (catId !== null) gastoPorCat.set(catId, (gastoPorCat.get(catId) ?? 0) + monto);
        } else if (row.tipo === 'ingreso') {
          total_ingresos += monto;
          if (catId !== null) ingresoPorCat.set(catId, (ingresoPorCat.get(catId) ?? 0) + monto);
        }

        return {
          id: Number(row.transaccion_id),
          tipo: row.tipo,
          monto,
          moneda: row.moneda,
          descripcion: row.descripcion,
          fecha: row.fecha,
          categoria: cat ? { slug: cat.slug, nombre: cat.nombre, icono: cat.icono } : null,
          usuario: usr ? { nombre: usr.nombre } : null,
        };
      });

    // 6. Per-category spending breakdown (planned categories only)
    const categorias_gastos = categories.map((row: any) => {
      const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
      const catId = Number(row.categoria_id);
      const gastado = gastoPorCat.get(catId) ?? 0;
      const limite = Number(row.limite);
      return {
        categoriaId: catId,
        slug: cat?.slug ?? null,
        nombre: cat?.nombre ?? null,
        icono: cat?.icono ?? null,
        color_hex: cat?.color_hex ?? null,
        limite,
        gastado,
        restante: Math.max(0, limite - gastado),
        porcentajeUsado: limite > 0 ? Math.round((gastado / limite) * 10000) / 100 : 0,
      };
    });

    // 7. Unplanned spending (categories with no configured limit)
    const otros_gastos: any[] = [];
    // Collect category meta from transactions for unplanned categories
    const catMetaFromTx = new Map<number, any>();
    for (const row of txs) {
      const catId = row.categoria_id ? Number(row.categoria_id) : null;
      if (catId !== null && !catMetaFromTx.has(catId)) {
        const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
        catMetaFromTx.set(catId, cat);
      }
    }

    for (const [catId, gastado] of gastoPorCat.entries()) {
      if (!plannedCatIds.has(catId)) {
        const cat = catMetaFromTx.get(catId);
        otros_gastos.push({
          categoriaId: catId,
          slug: cat?.slug ?? null,
          nombre: cat?.nombre ?? null,
          icono: cat?.icono ?? null,
          gastado,
        });
      }
    }

    // 8. Planned income breakdown (income plan categories)
    let ingresos_detalle: any[] = [];
    if (incomePlan.length > 0) {
      ingresos_detalle = incomePlan.map((row: any) => {
        const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
        const catId = row.categoria_id ? Number(row.categoria_id) : null;
        const monto_actual = catId !== null
          ? ingresoPorCat.get(catId) ?? 0
          : total_ingresos;
        const monto_planeado = Number(row.monto_planeado);
        return {
          categoriaId: catId,
          slug: cat?.slug ?? null,
          nombre: cat?.nombre ?? null,
          icono: cat?.icono ?? null,
          monto_planeado,
          monto_actual,
          diferencia: monto_actual - monto_planeado,
        };
      });
    }

    // 9. Unplanned income (income categories not in the plan)
    const otros_ingresos: any[] = [];
    for (const [catId, monto] of ingresoPorCat.entries()) {
      if (!plannedIncomeIds.has(catId)) {
        const cat = catMetaFromTx.get(catId);
        otros_ingresos.push({
          categoriaId: catId,
          slug: cat?.slug ?? null,
          nombre: cat?.nombre ?? null,
          icono: cat?.icono ?? null,
          monto_actual: monto,
        });
      }
    }

    const ingresos_presupuestados = Number(budget.ingresos ?? 0);

    await supabase.from('presupuesto_historial').insert({
      presupuesto_id: budgetId,
      periodo: budget.periodo,
      desde: range.desde,
      hasta: range.hasta,
      ingresos_presupuestados,
      ahorro_objetivo: Number(budget.ahorro_objetivo ?? 0),
      ingresos_reales: total_ingresos,
      total_gastos,
      balance: total_ingresos - total_gastos,
      sobro_presupuesto: ingresos_presupuestados - total_gastos,
      total_transacciones: transacciones.length,
      categorias_gastos,
      otros_gastos,
      ingresos_detalle,
      otros_ingresos,
      transacciones,
    });
  }

  // Computes the most recently CLOSED period range for a given budget.
  // Returns null for 'unico' (no recurring periods).
  private computePreviousPeriodRange(
    budget: any,
  ): { desde: string; hasta: string } | null {
    if (budget.periodo === 'unico') return null;

    const now = new Date();
    const todayDay = now.getUTCDate();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = Math.min(Number(budget.dia_inicio) || 1, 28);

    if (budget.periodo === 'mensual') {
      // Determine current period start (same logic as computeDateRange)
      let startYear = year;
      let startMonth = month;
      if (day > todayDay) {
        startMonth -= 1;
        if (startMonth < 0) { startMonth = 11; startYear -= 1; }
      }
      // Previous period start = same day, one month earlier
      let prevYear = startYear;
      let prevMonth = startMonth - 1;
      if (prevMonth < 0) { prevMonth = 11; prevYear -= 1; }

      const prevStart = new Date(Date.UTC(prevYear, prevMonth, day));
      const currentStart = new Date(Date.UTC(startYear, startMonth, day));
      const prevEnd = new Date(currentStart);
      prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);

      return { desde: this.isoDate(prevStart), hasta: this.isoDate(prevEnd) };
    }

    if (budget.periodo === 'quincenal') {
      let startYear = year;
      let startMonth = month;
      if (day > todayDay) {
        startMonth -= 1;
        if (startMonth < 0) { startMonth = 11; startYear -= 1; }
      }
      const currentStart = new Date(Date.UTC(startYear, startMonth, day));

      const prevEnd = new Date(currentStart);
      prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);

      const prevStart = new Date(currentStart);
      prevStart.setUTCDate(prevStart.getUTCDate() - 15);

      return { desde: this.isoDate(prevStart), hasta: this.isoDate(prevEnd) };
    }

    if (budget.periodo === 'semanal') {
      // Only snapshot on Mondays — creates clean Mon→Sun weekly boundaries.
      // If today is not Monday (UTC day 1), skip.
      if (now.getUTCDay() !== 1) return null;

      // Previous week: last Monday → last Sunday
      const prevStart = new Date(now);
      prevStart.setUTCDate(now.getUTCDate() - 7); // last Monday
      const prevEnd = new Date(now);
      prevEnd.setUTCDate(now.getUTCDate() - 1); // last Sunday

      return { desde: this.isoDate(prevStart), hasta: this.isoDate(prevEnd) };
    }

    return null;
  }

  private async assertAccess(userId: number, budgetId: number): Promise<void> {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('presupuesto_id, usuario_id, espacio_id')
      .eq('presupuesto_id', budgetId)
      .maybeSingle();

    if (error || !data) throw new NotFoundError('NOT_FOUND', 'Presupuesto no encontrado.');
    if (Number(data.usuario_id) === userId) return;

    if (data.espacio_id) {
      const { data: member } = await supabase
        .from('espacio_miembros')
        .select('usuario_id')
        .eq('espacio_id', Number(data.espacio_id))
        .eq('usuario_id', userId)
        .maybeSingle();
      if (member) return;
    }

    throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'No tiene acceso a este presupuesto.');
  }

  private mapHistorial(row: any) {
    return {
      historial_id: Number(row.historial_id),
      presupuesto_id: Number(row.presupuesto_id),
      periodo: row.periodo,
      desde: row.desde,
      hasta: row.hasta,
      ingresos_presupuestados: Number(row.ingresos_presupuestados),
      ahorro_objetivo: Number(row.ahorro_objetivo),
      ingresos_reales: Number(row.ingresos_reales),
      total_gastos: Number(row.total_gastos),
      balance: Number(row.balance),
      sobro_presupuesto: Number(row.sobro_presupuesto),
      total_transacciones: Number(row.total_transacciones),
      categorias_gastos: row.categorias_gastos ?? [],
      otros_gastos: row.otros_gastos ?? [],
      ingresos_detalle: row.ingresos_detalle ?? [],
      otros_ingresos: row.otros_ingresos ?? [],
      transacciones: row.transacciones ?? [],
      creado_en: row.creado_en,
    };
  }

  private isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
