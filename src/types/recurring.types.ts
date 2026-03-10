export type FrecuenciaRecurrente = 'mensual' | 'quincenal' | 'semanal';
export type TipoTransaccion = 'ingreso' | 'gasto' | 'transferencia';
export type Moneda = 'DOP' | 'USD';

export interface CreateRecurringDTO {
  budgetId: number;
  walletId?: number | null;
  catKey?: string | null;
  tipo: TipoTransaccion;
  monto: number;
  moneda?: Moneda;
  descripcion?: string | null;
  nota?: string | null;
  frecuencia: FrecuenciaRecurrente;
  diaEjecucion: number;
  activo?: boolean;
}

export interface UpdateRecurringDTO {
  budgetId?: number;
  walletId?: number | null;
  catKey?: string | null;
  tipo?: TipoTransaccion;
  monto?: number;
  moneda?: Moneda;
  descripcion?: string | null;
  nota?: string | null;
  frecuencia?: FrecuenciaRecurrente;
  diaEjecucion?: number;
  activo?: boolean;
}
