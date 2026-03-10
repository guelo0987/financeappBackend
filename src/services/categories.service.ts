import { z } from 'zod';
import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { CategoryDTO, UpdateCategoryDTO } from '../types/categories.types';

const supabase: any = getSupabaseClient();

const createCategorySchema = z.object({
  nombre: z.string().min(1, 'nombre requerido').max(80, 'nombre demasiado largo'),
  icono: z.string().min(1).max(80).optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'color_hex inválido').optional(),
  categoria_padre_id: z.number().int().positive().nullable().optional(),
});

const updateCategorySchema = z.object({
  nombre: z.string().min(1).max(80).optional(),
  icono: z.string().min(1).max(80).optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  categoria_padre_id: z.number().int().positive().nullable().optional(),
});

export class CategoriesService {
  async getGroupedForUser(userId: number) {
    const rows = await this.getAllForUser(userId);
    const parents = rows.filter((row: any) => row.categoria_padre_id === null);
    const children = rows.filter((row: any) => row.categoria_padre_id !== null);

    const groups = parents.map((parent: any) => ({
      parent: {
        categoria_id: Number(parent.categoria_id),
        usuario_id: parent.usuario_id ? Number(parent.usuario_id) : null,
        nombre: parent.nombre,
        icono: parent.icono,
        color_hex: parent.color_hex,
        es_sistema: !!parent.es_sistema,
        slug: parent.slug,
        creado_en: parent.creado_en,
      },
      categorias: children
        .filter((child: any) => Number(child.categoria_padre_id) === Number(parent.categoria_id))
        .map((child: any) => ({
          categoria_id: Number(child.categoria_id),
          categoria_padre_id: Number(child.categoria_padre_id),
          usuario_id: child.usuario_id ? Number(child.usuario_id) : null,
          nombre: child.nombre,
          icono: child.icono,
          color_hex: child.color_hex,
          es_sistema: !!child.es_sistema,
          slug: child.slug,
          creado_en: child.creado_en,
        })),
    }));

    return groups;
  }

  async getAllForUser(userId: number) {
    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id, categoria_padre_id, usuario_id, nombre, icono, color_hex, es_sistema, slug, creado_en')
      .or(`es_sistema.eq.true,usuario_id.eq.${userId}`)
      .order('categoria_padre_id', { ascending: true, nullsFirst: true })
      .order('es_sistema', { ascending: false })
      .order('nombre', { ascending: true });

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las categorías.');
    }

    return data ?? [];
  }

  async getSystemCategories() {
    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id, categoria_padre_id, usuario_id, nombre, icono, color_hex, es_sistema, slug, creado_en')
      .eq('es_sistema', true)
      .order('categoria_padre_id', { ascending: true, nullsFirst: true })
      .order('nombre', { ascending: true });

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las categorías del sistema.');
    }

    return data ?? [];
  }

  async create(userId: number, dto: CategoryDTO) {
    const parsed = createCategorySchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    }

    const payload = parsed.data;
    const slug = this.generateSlug(payload.nombre);
    if (payload.categoria_padre_id) {
      await this.validateParentCategory(userId, payload.categoria_padre_id);
    }

    const { data, error } = await supabase
      .from('categorias')
      .insert({
        usuario_id: userId,
        categoria_padre_id: payload.categoria_padre_id ?? null,
        nombre: payload.nombre.trim(),
        icono: payload.icono ?? 'circle',
        color_hex: payload.color_hex ?? '#C9A84C',
        es_sistema: false,
        slug,
      })
      .select('categoria_id, categoria_padre_id, usuario_id, nombre, icono, color_hex, es_sistema, slug, creado_en')
      .single();

    if (error?.code === '23505') {
      throw new ConflictError(
        'CATEGORY_DUPLICATE_NAME',
        'Ya existe una categoría con ese nombre.',
      );
    }

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear la categoría.');
    }

    return data;
  }

  async update(userId: number, categoryId: number, dto: UpdateCategoryDTO) {
    const parsed = updateCategorySchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    }

    const category = await this.getOwnedMutableCategory(userId, categoryId);
    const payload = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (payload.nombre !== undefined) {
      updateData.nombre = payload.nombre.trim();
      updateData.slug = this.generateSlug(payload.nombre);
    }
    if (payload.icono !== undefined) updateData.icono = payload.icono;
    if (payload.color_hex !== undefined) updateData.color_hex = payload.color_hex;
    if (payload.categoria_padre_id !== undefined) {
      if (payload.categoria_padre_id) {
        await this.validateParentCategory(userId, payload.categoria_padre_id, categoryId);
      }
      updateData.categoria_padre_id = payload.categoria_padre_id;
    }

    if (Object.keys(updateData).length === 0) {
      return category;
    }

    const { data, error } = await supabase
      .from('categorias')
      .update(updateData)
      .eq('categoria_id', categoryId)
      .eq('usuario_id', userId)
      .select('categoria_id, categoria_padre_id, usuario_id, nombre, icono, color_hex, es_sistema, slug, creado_en')
      .single();

    if (error?.code === '23505') {
      throw new ConflictError(
        'CATEGORY_DUPLICATE_NAME',
        'Ya existe una categoría con ese nombre.',
      );
    }

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar la categoría.');
    }

    return data;
  }

  async delete(userId: number, categoryId: number): Promise<void> {
    await this.getOwnedMutableCategory(userId, categoryId);

    const { error } = await supabase
      .from('categorias')
      .delete()
      .eq('categoria_id', categoryId)
      .eq('usuario_id', userId);

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo eliminar la categoría.');
    }
  }

  private async getOwnedMutableCategory(userId: number, categoryId: number) {
    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id, categoria_padre_id, usuario_id, es_sistema, nombre, icono, color_hex, slug, creado_en')
      .eq('categoria_id', categoryId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar la categoría.');
    }

    if (!data) {
      throw new NotFoundError('NOT_FOUND', 'Categoría no encontrada.');
    }

    if (data.es_sistema) {
      throw new BadRequestError('SYSTEM_CATEGORY_IMMUTABLE', 'No se puede modificar una categoría del sistema.');
    }

    if (Number(data.usuario_id) !== userId) {
      throw new NotFoundError('NOT_FOUND', 'Categoría no encontrada.');
    }

    return data;
  }

  private generateSlug(nombre: string): string {
    return nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private async validateParentCategory(
    userId: number,
    parentId: number,
    currentCategoryId?: number,
  ): Promise<void> {
    if (currentCategoryId && currentCategoryId === parentId) {
      throw new BadRequestError('VALIDACION_ERROR', 'Una categoría no puede ser su propia categoría padre.');
    }

    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id, categoria_padre_id, usuario_id, es_sistema')
      .eq('categoria_id', parentId)
      .or(`es_sistema.eq.true,usuario_id.eq.${userId}`)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar la categoría padre.');
    }
    if (!data) {
      throw new NotFoundError('NOT_FOUND', 'La categoría padre no existe.');
    }

    if (data.categoria_padre_id !== null) {
      throw new BadRequestError(
        'VALIDACION_ERROR',
        'La categoría padre debe ser de primer nivel (sin categoría padre).',
      );
    }
  }
}
