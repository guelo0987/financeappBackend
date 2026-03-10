import { getSupabaseClient } from '../config/supabase';
import { BadRequestError } from '../utils/errors';

const supabase: any = getSupabaseClient();

export class DashboardService {
  async getDashboard(userId: number) {
    const currentRange = this.currentMonthRange();

    const [activeBudget, currentMonth, wallets, recentTransactions, topCategories] = await Promise.all([
      this.getActiveBudget(userId),
      this.getCurrentMonthSummary(userId, currentRange),
      this.getWalletTotals(userId),
      this.getRecentTransactions(userId),
      this.getTopCategories(userId, currentRange),
    ]);

    return {
      activeBudget,
      currentMonth,
      wallets,
      recentTransactions,
      topCategories,
    };
  }

  private async getActiveBudget(userId: number) {
    const { data: budget, error } = await supabase
      .from('presupuestos')
      .select('presupuesto_id, nombre, periodo, dia_inicio, ingresos, activo, creado_en')
      .eq('usuario_id', userId)
      .eq('activo', true)
      .order('actualizado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo cargar el presupuesto activo.');
    if (!budget) return null;

    const range = this.computeBudgetRange(budget);
    const { data: categories, error: catError } = await supabase
      .from('presupuesto_categorias')
      .select('categoria_id, limite, categorias(slug, nombre, icono, color_hex)')
      .eq('presupuesto_id', budget.presupuesto_id);
    if (catError) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar categorías del presupuesto.');

    const categoryIds = (categories ?? []).map((row: any) => row.categoria_id);
    let spentRows: any[] = [];
    if (categoryIds.length > 0) {
      const { data, error: spentError } = await supabase
        .from('transacciones')
        .select('categoria_id, monto')
        .eq('usuario_id', userId)
        .eq('tipo', 'gasto')
        .gte('fecha', range.desde)
        .lte('fecha', range.hasta)
        .in('categoria_id', categoryIds);
      if (spentError) throw new BadRequestError('DB_ERROR', 'No se pudo calcular gasto del presupuesto.');
      spentRows = data ?? [];
    }

    const spentMap = new Map<number, number>();
    for (const row of spentRows) {
      const key = Number(row.categoria_id);
      spentMap.set(key, (spentMap.get(key) ?? 0) + Number(row.monto));
    }

    const enrichedCategories = (categories ?? []).map((row: any) => {
      const cat = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
      const limite = Number(row.limite);
      const gastado = spentMap.get(Number(row.categoria_id)) ?? 0;
      const percentUsed = limite > 0 ? (gastado / limite) * 100 : 0;
      return {
        slug: cat?.slug ?? null,
        nombre: cat?.nombre ?? null,
        icono: cat?.icono ?? null,
        color: cat?.color_hex ?? null,
        limite,
        gastado,
        percentUsed,
      };
    });

    const totalSpent = enrichedCategories.reduce(
      (acc: number, c: { gastado: number }) => acc + c.gastado,
      0,
    );
    const ingresos = Number(budget.ingresos ?? 0);

    return {
      id: Number(budget.presupuesto_id),
      nombre: budget.nombre,
      periodo: budget.periodo,
      ingresos,
      totalSpent,
      remaining: ingresos - totalSpent,
      percentUsed: ingresos > 0 ? (totalSpent / ingresos) * 100 : 0,
      categories: enrichedCategories,
    };
  }

  private async getCurrentMonthSummary(userId: number, range: { desde: string; hasta: string }) {
    const { data, error } = await supabase
      .from('transacciones')
      .select('tipo, monto')
      .eq('usuario_id', userId)
      .gte('fecha', range.desde)
      .lte('fecha', range.hasta);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo calcular el resumen mensual.');

    let totalIngresos = 0;
    let totalGastos = 0;
    for (const row of data ?? []) {
      const monto = Number(row.monto);
      if (row.tipo === 'ingreso') totalIngresos += monto;
      if (row.tipo === 'gasto') totalGastos += monto;
    }

    return {
      totalIngresos,
      totalGastos,
      balance: totalIngresos - totalGastos,
      transactionCount: (data ?? []).length,
    };
  }

  private async getWalletTotals(userId: number) {
    const { data, error } = await supabase
      .from('activos')
      .select('tipo, valor_actual')
      .eq('usuario_id', userId);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo calcular el resumen de cuentas.');

    let totalBalance = 0;
    let totalDebt = 0;
    for (const row of data ?? []) {
      const value = Number(row.valor_actual);
      if (row.tipo === 'deudas') totalDebt += value;
      else totalBalance += value;
    }

    return {
      totalBalance,
      totalDebt,
      netWorth: totalBalance - totalDebt,
    };
  }

  private async getRecentTransactions(userId: number) {
    const { data, error } = await supabase
      .from('transacciones')
      .select(
        'transaccion_id, tipo, monto, moneda, descripcion, fecha, categoria_id, categorias(slug, nombre, icono, color_hex)',
      )
      .eq('usuario_id', userId)
      .order('fecha', { ascending: false })
      .order('transaccion_id', { ascending: false })
      .limit(5);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las transacciones recientes.');

    return (data ?? []).map((row: any) => {
      const category = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
      return {
        id: Number(row.transaccion_id),
        tipo: row.tipo,
        monto: Number(row.monto),
        moneda: row.moneda,
        descripcion: row.descripcion,
        fecha: row.fecha,
        categoria: category
          ? {
              slug: category.slug,
              nombre: category.nombre,
              icono: category.icono,
              color: category.color_hex,
            }
          : null,
      };
    });
  }

  private async getTopCategories(userId: number, range: { desde: string; hasta: string }) {
    const { data, error } = await supabase
      .from('transacciones')
      .select('monto, categoria_id, categorias(slug, nombre, icono, color_hex)')
      .eq('usuario_id', userId)
      .eq('tipo', 'gasto')
      .gte('fecha', range.desde)
      .lte('fecha', range.hasta);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron calcular las top categorías.');

    const totals = new Map<number, { monto: number; meta: any }>();
    for (const row of data ?? []) {
      const category = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
      if (!row.categoria_id || !category) continue;
      const key = Number(row.categoria_id);
      const prev = totals.get(key);
      if (!prev) {
        totals.set(key, { monto: Number(row.monto), meta: category });
      } else {
        prev.monto += Number(row.monto);
      }
    }

    return Array.from(totals.values())
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5)
      .map((entry) => ({
        slug: entry.meta.slug,
        nombre: entry.meta.nombre,
        monto: entry.monto,
        icono: entry.meta.icono,
        color: entry.meta.color_hex,
      }));
  }

  private currentMonthRange() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return { desde: this.isoDate(start), hasta: this.isoDate(end) };
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
      const start = new Date(now);
      start.setUTCDate(now.getUTCDate() - 6);
      return { desde: this.isoDate(start), hasta: this.isoDate(now) };
    }

    const created = new Date(budget.creado_en);
    return { desde: this.isoDate(created), hasta: this.isoDate(now) };
  }

  private isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
