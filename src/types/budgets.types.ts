export type PeriodoPresupuesto = 'mensual' | 'quincenal' | 'semanal' | 'unico';

export interface BudgetCategoryInput {
  categoriaId: number;
  limite: number;
}

export interface CreateBudgetDTO {
  nombre: string;
  periodo: PeriodoPresupuesto;
  dia_inicio?: number;
  ingresos?: number;
  activo?: boolean;
  espacio_id?: number | null;
  categorias?: BudgetCategoryInput[];
}

export interface UpdateBudgetDTO {
  nombre?: string;
  periodo?: PeriodoPresupuesto;
  dia_inicio?: number;
  ingresos?: number;
  activo?: boolean;
  espacio_id?: number | null;
}

