export type SubtipoWallet = 'ahorro' | 'gasto' | 'deuda';
export type Moneda = 'DOP' | 'USD';

export interface CreateWalletDTO {
  nombre: string;
  subtipo: SubtipoWallet;
  saldo: number;
  moneda?: Moneda;
  institucion_nombre?: string;
  color_hex?: string;
  icono?: string;
  ticker_simbolo?: string;
  espacio_id?: number | null;
}

export interface UpdateWalletDTO {
  nombre?: string;
  subtipo?: SubtipoWallet;
  saldo?: number;
  moneda?: Moneda;
  institucion_nombre?: string | null;
  color_hex?: string;
  icono?: string;
  ticker_simbolo?: string | null;
}

