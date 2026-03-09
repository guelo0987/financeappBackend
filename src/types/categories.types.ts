export type TipoTransaccion = 'ingreso' | 'gasto' | 'transferencia';

export interface CategoryDTO {
  nombre: string;
  tipo: TipoTransaccion;
  icono?: string;
  color_hex?: string;
}

export interface UpdateCategoryDTO {
  nombre?: string;
  tipo?: TipoTransaccion;
  icono?: string;
  color_hex?: string;
}

