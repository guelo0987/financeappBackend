export interface CategoryDTO {
  nombre: string;
  icono?: string;
  categoria_padre_id?: number | null;
}

export interface UpdateCategoryDTO {
  nombre?: string;
  icono?: string;
  categoria_padre_id?: number | null;
}
