export type TipoCategoria = 'ingreso' | 'gasto' | 'transferencia';

export interface CategoryDTO {
  nombre: string;
  tipo?: TipoCategoria;
  icono?: string;
  color_hex?: string;
  categoria_padre_id?: number | null;
}

export interface UpdateCategoryDTO {
  nombre?: string;
  tipo?: TipoCategoria;
  icono?: string;
  color_hex?: string;
  categoria_padre_id?: number | null;
}
