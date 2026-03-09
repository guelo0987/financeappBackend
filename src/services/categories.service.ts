import { z } from 'zod';
import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { CategoryDTO, UpdateCategoryDTO } from '../types/categories.types';

const supabase: any = getSupabaseClient();

const createCategorySchema = z.object({
  nombre: z.string().min(1, 'nombre requerido').max(80, 'nombre demasiado largo'),
  tipo: z.enum(['ingreso', 'gasto', 'transferencia']),
  icono: z.string().min(1).max(80).optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'color_hex inválido').optional(),
});

const updateCategorySchema = z.object({
  nombre: z.string().min(1).max(80).optional(),
  tipo: z.enum(['ingreso', 'gasto', 'transferencia']).optional(),
  icono: z.string().min(1).max(80).optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export class CategoriesService {
  async getAllForUser(userId: number) {
    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id, usuario_id, nombre, tipo, icono, color_hex, es_sistema, slug, creado_en')
      .or(`es_sistema.eq.true,usuario_id.eq.${userId}`)
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
      .select('categoria_id, usuario_id, nombre, tipo, icono, color_hex, es_sistema, slug, creado_en')
      .eq('es_sistema', true)
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

    const { data, error } = await supabase
      .from('categorias')
      .insert({
        usuario_id: userId,
        nombre: payload.nombre.trim(),
        tipo: payload.tipo,
        icono: payload.icono ?? 'circle',
        color_hex: payload.color_hex ?? '#C9A84C',
        es_sistema: false,
        slug,
      })
      .select('categoria_id, usuario_id, nombre, tipo, icono, color_hex, es_sistema, slug, creado_en')
      .single();

    if (error?.code === '23505') {
      throw new ConflictError(
        'CATEGORY_DUPLICATE_NAME',
        'Ya existe una categoría con ese nombre y tipo.',
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
    if (payload.tipo !== undefined) updateData.tipo = payload.tipo;
    if (payload.icono !== undefined) updateData.icono = payload.icono;
    if (payload.color_hex !== undefined) updateData.color_hex = payload.color_hex;

    if (Object.keys(updateData).length === 0) {
      return category;
    }

    const { data, error } = await supabase
      .from('categorias')
      .update(updateData)
      .eq('categoria_id', categoryId)
      .eq('usuario_id', userId)
      .select('categoria_id, usuario_id, nombre, tipo, icono, color_hex, es_sistema, slug, creado_en')
      .single();

    if (error?.code === '23505') {
      throw new ConflictError(
        'CATEGORY_DUPLICATE_NAME',
        'Ya existe una categoría con ese nombre y tipo.',
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
      .select('categoria_id, usuario_id, es_sistema, nombre, tipo, icono, color_hex, slug, creado_en')
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
}

