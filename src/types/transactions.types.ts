export type TipoTransaccion = 'ingreso' | 'gasto' | 'transferencia';
export type Moneda = 'DOP' | 'USD';

export interface CreateTransactionDTO {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: TipoTransaccion;
  catKey: string;
  walletId: number;
  toWalletId?: number;
  nota?: string;
  moneda?: Moneda;
}

export interface UpdateTransactionDTO {
  fecha?: string;
  descripcion?: string;
  monto?: number;
  tipo?: TipoTransaccion;
  catKey?: string;
  walletId?: number;
  toWalletId?: number | null;
  nota?: string | null;
  moneda?: Moneda;
}

export interface TransactionFilters {
  page?: number;
  limit?: number;
  tipo?: TipoTransaccion;
  catKey?: string;
  desde?: string;
  hasta?: string;
  walletId?: number;
  search?: string;
}

