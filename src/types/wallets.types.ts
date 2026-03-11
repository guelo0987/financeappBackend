export type TipoWallet = 'gastos' | 'cuentas' | 'deudas';
export type Moneda = 'DOP' | 'USD';

export interface CreateWalletDTO {
  nombre: string;
  tipo: TipoWallet;
  saldo: number;
  moneda?: Moneda;
  color_hex?: string;
  icono?: string;
  incluir_en_patrimonio?: boolean;
}

export interface UpdateWalletDTO {
  nombre?: string;
  tipo?: TipoWallet;
  saldo?: number;
  moneda?: Moneda;
  color_hex?: string;
  icono?: string;
  incluir_en_patrimonio?: boolean;
}
