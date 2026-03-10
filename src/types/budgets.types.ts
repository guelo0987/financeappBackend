export type PeriodoPresupuesto = 'mensual' | 'quincenal' | 'semanal' | 'unico';

export interface BudgetCategoryInput {
  categoriaId: number;
  limite: number;
}

export interface BudgetIncomeInput {
  categoriaId: number;
  monto: number;
}

export interface CreateBudgetDTO {
  nombre: string;
  periodo: PeriodoPresupuesto;
  dia_inicio?: number;
  ingresos?: number;
  ahorro_objetivo?: number;
  activo?: boolean;
  espacio_id?: number | null;
  categorias?: BudgetCategoryInput[];
  ingresos_detalle?: BudgetIncomeInput[];
}

export interface UpdateBudgetDTO {
  nombre?: string;
  periodo?: PeriodoPresupuesto;
  dia_inicio?: number;
  ingresos?: number;
  ahorro_objetivo?: number;
  activo?: boolean;
  espacio_id?: number | null;
  ingresos_detalle?: BudgetIncomeInput[];
}
