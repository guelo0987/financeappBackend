import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, NotFoundError } from '../utils/errors';

const supabase: any = getSupabaseClient();

export class InsightsService {
  async getInsights(userId: number, periodo: string = 'mensual', presupuestoId?: number) {
    const budgetId = presupuestoId ?? (await this.getActiveBudgetId(userId));

    const [spendingTrend, largestTransactions, spendingByDayOfWeek] = await Promise.all([
      this.getSpendingTrend(userId, periodo),
      this.getLargestTransactions(userId, 10),
      this.getSpendingByDayOfWeek(userId),
    ]);

    let overBudgetAlerts: any[] = [];
    let projectedSpend: any = null;
    if (budgetId) {
      [overBudgetAlerts, projectedSpend] = await Promise.all([
        this.getOverBudgetAlerts(userId, budgetId),
        this.getProjectedSpend(userId, budgetId),
      ]);
    }

    return {
      spendingTrend,
      overBudgetAlerts,
      projectedSpend,
      largestTransactions,
      spendingByDayOfWeek,
    };
  }

  async getSpendingTrend(userId: number, periodo: string) {
    const current = this.periodRange(periodo, new Date());
    const previous = this.previousRange(current);

    const [currentRows, previousRows] = await Promise.all([
      this.fetchCategorySpend(userId, current.desde, current.hasta),
      this.fetchCategorySpend(userId, previous.desde, previous.hasta),
    ]);

    const currentMap = this.toCategoryMap(currentRows);
    const previousMap = this.toCategoryMap(previousRows);

    const allKeys = new Set([...currentMap.keys(), ...previousMap.keys()]);
    const categories = Array.from(allKeys).map((key) => {
      const curr = currentMap.get(key) ?? 0;
      const prev = previousMap.get(key) ?? 0;
      const change = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
      return {
        categoriaId: key,
        actual: curr,
        previo: prev,
        cambioPct: change,
      };
    });

    categories.sort((a, b) => Math.abs(b.cambioPct) - Math.abs(a.cambioPct));
    return {
      periodo,
      actual: current,
      previo: previous,
      categorias: categories,
    };
  }

  async getOverBudgetAlerts(userId: number, budgetId: number) {
    const budget = await this.getOwnedBudget(userId, budgetId);
    const range = this.computeBudgetRange(budget);

    const { data: categories, error } = await supabase
      .from('presupuesto_categorias')
      .select('categoria_id, limite, categorias(slug, nombre, icono)')
      .eq('presupuesto_id', budgetId);
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar categorías del presupuesto.');

    const ids = (categories ?? []).map((c: any) => c.categoria_id);
    if (!ids.length) return [];

    const { data: txRows, error: txError } = await supabase
      .from('transacciones')
      .select('categoria_id, monto')
      .eq('usuario_id', userId)
      .eq('tipo', 'gasto')
      .gte('fecha', range.desde)
      .lte('fecha', range.hasta)
      .in('categoria_id', ids);
    if (txError) throw new BadRequestError('DB_ERROR', 'No se pudieron calcular alertas.');

    const spent = new Map<number, number>();
    for (const row of txRows ?? []) {
      const key = Number(row.categoria_id);
      spent.set(key, (spent.get(key) ?? 0) + Number(row.monto));
    }

    const alerts = [];
    for (const row of categories ?? []) {
      const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
      const limite = Number(row.limite);
      const gastado = spent.get(Number(row.categoria_id)) ?? 0;
      if (gastado <= limite) continue;
      alerts.push({
        categoriaId: Number(row.categoria_id),
        slug: cat?.slug ?? null,
        nombre: cat?.nombre ?? null,
        icono: cat?.icono ?? null,
        limite,
        gastado,
        exceso: gastado - limite,
        excesoPct: limite > 0 ? ((gastado - limite) / limite) * 100 : 0,
      });
    }

    alerts.sort((a, b) => b.exceso - a.exceso);
    return alerts;
  }

  async getProjectedSpend(userId: number, budgetId: number) {
    const budget = await this.getOwnedBudget(userId, budgetId);
    const range = this.computeBudgetRange(budget);

    const { data, error } = await supabase
      .from('transacciones')
      .select('monto')
      .eq('usuario_id', userId)
      .eq('tipo', 'gasto')
      .gte('fecha', range.desde)
      .lte('fecha', range.hasta);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo calcular la proyección.');

    const spentSoFar = (data ?? []).reduce((acc: number, row: any) => acc + Number(row.monto), 0);
    const now = new Date();
    const start = new Date(`${range.desde}T00:00:00.000Z`);
    const end = new Date(`${range.hasta}T00:00:00.000Z`);
    const elapsedDays = Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000) + 1);
    const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
    const dailyRate = spentSoFar / elapsedDays;
    const projected = dailyRate * totalDays;

    return {
      presupuestoId: Number(budget.presupuesto_id),
      periodo: budget.periodo,
      desde: range.desde,
      hasta: range.hasta,
      spentSoFar,
      elapsedDays,
      totalDays,
      dailyRate,
      projectedTotal: projected,
      projectedRemaining: Number(budget.ingresos ?? 0) - projected,
    };
  }

  async getLargestTransactions(userId: number, limit: number) {
    const safeLimit = Math.max(1, Math.min(50, limit));
    const { data, error } = await supabase
      .from('transacciones')
      .select('transaccion_id, tipo, monto, moneda, descripcion, fecha, categoria_id, categorias(slug, nombre, icono)')
      .eq('usuario_id', userId)
      .eq('tipo', 'gasto')
      .order('monto', { ascending: false })
      .limit(safeLimit);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar transacciones grandes.');

    return (data ?? []).map((row: any) => {
      const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
      return {
        id: Number(row.transaccion_id),
        tipo: row.tipo,
        monto: Number(row.monto),
        moneda: row.moneda,
        descripcion: row.descripcion,
        fecha: row.fecha,
        categoria: cat
          ? { slug: cat.slug, nombre: cat.nombre, icono: cat.icono }
          : null,
      };
    });
  }

  async getSpendingByDayOfWeek(userId: number) {
    const { data, error } = await supabase
      .from('transacciones')
      .select('fecha, monto')
      .eq('usuario_id', userId)
      .eq('tipo', 'gasto');

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo calcular patrón por día.');

    const labels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const totals = Array.from({ length: 7 }, () => 0);
    const counts = Array.from({ length: 7 }, () => 0);

    for (const row of data ?? []) {
      const d = new Date(`${row.fecha}T00:00:00.000Z`);
      const jsDay = d.getUTCDay(); // 0 domingo
      const index = jsDay === 0 ? 6 : jsDay - 1;
      totals[index] += Number(row.monto);
      counts[index] += 1;
    }

    return labels.map((dia, idx) => ({
      dia,
      total: totals[idx],
      cantidad: counts[idx],
      promedio: counts[idx] > 0 ? totals[idx] / counts[idx] : 0,
    }));
  }

  private periodRange(periodo: string, now: Date) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    if (periodo === 'semanal') {
      const end = new Date(now);
      const start = new Date(now);
      start.setUTCDate(end.getUTCDate() - 6);
      return { desde: this.isoDate(start), hasta: this.isoDate(end) };
    }

    if (periodo === 'quincenal') {
      const end = new Date(now);
      const start = new Date(now);
      start.setUTCDate(end.getUTCDate() - 14);
      return { desde: this.isoDate(start), hasta: this.isoDate(end) };
    }

    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));
    return { desde: this.isoDate(start), hasta: this.isoDate(end) };
  }

  private previousRange(current: { desde: string; hasta: string }) {
    const start = new Date(`${current.desde}T00:00:00.000Z`);
    const end = new Date(`${current.hasta}T00:00:00.000Z`);
    const len = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    const prevEnd = new Date(start);
    prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setUTCDate(prevStart.getUTCDate() - (len - 1));
    return { desde: this.isoDate(prevStart), hasta: this.isoDate(prevEnd) };
  }

  private async fetchCategorySpend(userId: number, desde: string, hasta: string) {
    const { data, error } = await supabase
      .from('transacciones')
      .select('categoria_id, monto')
      .eq('usuario_id', userId)
      .eq('tipo', 'gasto')
      .gte('fecha', desde)
      .lte('fecha', hasta);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo calcular tendencia de gasto.');
    return data ?? [];
  }

  private toCategoryMap(rows: any[]) {
    const map = new Map<number, number>();
    for (const row of rows) {
      if (!row.categoria_id) continue;
      const key = Number(row.categoria_id);
      map.set(key, (map.get(key) ?? 0) + Number(row.monto));
    }
    return map;
  }

  private async getActiveBudgetId(userId: number): Promise<number | null> {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('presupuesto_id')
      .eq('usuario_id', userId)
      .eq('activo', true)
      .limit(1)
      .maybeSingle();
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo obtener presupuesto activo.');
    return data ? Number(data.presupuesto_id) : null;
  }

  private async getOwnedBudget(userId: number, budgetId: number) {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('presupuesto_id, usuario_id, periodo, dia_inicio, ingresos, creado_en')
      .eq('presupuesto_id', budgetId)
      .eq('usuario_id', userId)
      .maybeSingle();
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar presupuesto.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Presupuesto no encontrado.');
    return data;
  }

  private computeBudgetRange(budget: any) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = Math.min(Number(budget.dia_inicio) || 1, 28);

    if (budget.periodo === 'mensual') {
      const start = new Date(Date.UTC(year, month, day));
      const end = new Date(Date.UTC(year, month + 1, 0));
      return { desde: this.isoDate(start), hasta: this.isoDate(end) };
    }
    if (budget.periodo === 'quincenal') {
      const start = new Date(Date.UTC(year, month, day));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 14);
      return { desde: this.isoDate(start), hasta: this.isoDate(end) };
    }
    if (budget.periodo === 'semanal') {
      const end = new Date(now);
      const start = new Date(now);
      start.setUTCDate(end.getUTCDate() - 6);
      return { desde: this.isoDate(start), hasta: this.isoDate(end) };
    }
    const created = new Date(budget.creado_en);
    return { desde: this.isoDate(created), hasta: this.isoDate(now) };
  }

  private isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
