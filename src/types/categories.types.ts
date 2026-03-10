export interface CategoryDTO {
  nombre: string;
  icono?: string;
  color_hex?: string;
  categoria_padre_id?: number | null;
}

export interface UpdateCategoryDTO {
  nombre?: string;
  icono?: string;
  color_hex?: string;
  categoria_padre_id?: number | null;
}
