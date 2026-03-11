import { z } from 'zod';
import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { CategoryDTO, UpdateCategoryDTO } from '../types/categories.types';

const supabase: any = getSupabaseClient();

const CATEGORY_SELECT =
  'categoria_id, categoria_padre_id, usuario_id, nombre, tipo, icono, color_hex, es_sistema, slug, creado_en';

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const createParentCategorySchema = z.object({
  nombre: z.string().min(1, 'nombre requerido').max(80, 'nombre demasiado largo'),
  tipo: z.enum(['ingreso', 'gasto', 'transferencia']),
  icono: z.string().min(1).max(80).optional(),
  color_hex: z.string().regex(HEX_COLOR_REGEX, 'color_hex debe ser un color hex válido (#RRGGBB)').optional(),
});

const createCategorySchema = z.object({
  nombre: z.string().min(1, 'nombre requerido').max(80, 'nombre demasiado largo'),
  tipo: z.enum(['ingreso', 'gasto', 'transferencia']).optional(),
  icono: z.string().min(1).max(80).optional(),
  color_hex: z.string().regex(HEX_COLOR_REGEX, 'color_hex debe ser un color hex válido (#RRGGBB)').optional(),
  categoria_padre_id: z.number().int().positive().nullable().optional(),
});

const updateCategorySchema = z.object({
  nombre: z.string().min(1).max(80).optional(),
  tipo: z.enum(['ingreso', 'gasto', 'transferencia']).optional(),
  icono: z.string().min(1).max(80).optional(),
  color_hex: z.string().regex(HEX_COLOR_REGEX, 'color_hex debe ser un color hex válido (#RRGGBB)').optional(),
  categoria_padre_id: z.number().int().positive().nullable().optional(),
});

export class CategoriesService {
  async getGroupedForUser(userId: number, tipo?: string) {
    const rows = await this.getAllForUser(userId, tipo);
    const parents = rows.filter((row: any) => row.categoria_padre_id === null);
    const children = rows.filter((row: any) => row.categoria_padre_id !== null);

    const groups = parents.map((parent: any) => ({
      parent: this.mapCategory(parent),
      categorias: children
        .filter((child: any) => Number(child.categoria_padre_id) === Number(parent.categoria_id))
        .map((child: any) => this.mapCategory(child)),
    }));

    return groups;
  }

  async getParentsForUser(userId: number, tipo?: string) {
    let query = supabase
      .from('categorias')
      .select(CATEGORY_SELECT)
      .is('categoria_padre_id', null)
      .or(`es_sistema.eq.true,usuario_id.eq.${userId}`);

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query
      .order('es_sistema', { ascending: false })
      .order('nombre', { ascending: true });

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las categorías padre.');
    }

    return (data ?? []).map((row: any) => this.mapCategory(row));
  }

  async createParent(userId: number, dto: { nombre: string; tipo: string; icono?: string; color_hex?: string }) {
    const parsed = createParentCategorySchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    }

    const payload = parsed.data;
    const slug = this.generateSlug(payload.nombre);

    const { data, error } = await supabase
      .from('categorias')
      .insert({
        usuario_id: userId,
        categoria_padre_id: null,
        nombre: payload.nombre.trim(),
        tipo: payload.tipo,
        icono: payload.icono ?? 'circle',
        color_hex: payload.color_hex ?? '#6B7280',
        es_sistema: false,
        slug,
      })
      .select(CATEGORY_SELECT)
      .single();

    if (error?.code === '23505') {
      throw new ConflictError(
        'CATEGORY_DUPLICATE_NAME',
        'Ya existe una categoría padre con ese nombre y tipo.',
      );
    }

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear la categoría padre.');
    }

    return data;
  }

  async getAllForUser(userId: number, tipo?: string) {
    let query = supabase
      .from('categorias')
      .select(CATEGORY_SELECT)
      .or(`es_sistema.eq.true,usuario_id.eq.${userId}`);

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query
      .order('categoria_padre_id', { ascending: true, nullsFirst: true })
      .order('es_sistema', { ascending: false })
      .order('nombre', { ascending: true });

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las categorías.');
    }

    return data ?? [];
  }

  async getSystemCategories(tipo?: string) {
    let query = supabase
      .from('categorias')
      .select(CATEGORY_SELECT)
      .eq('es_sistema', true);

    if (tipo) {
      query = query.eq('tipo', tipo);
    }

    const { data, error } = await query
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

    let tipo = payload.tipo ?? 'gasto';
    let color_hex = payload.color_hex ?? '#6B7280';

    if (payload.categoria_padre_id) {
      const parent = await this.validateParentCategory(userId, payload.categoria_padre_id);
      // Inherit tipo from parent; if explicit tipo was sent, validate it matches
      if (payload.tipo && payload.tipo !== parent.tipo) {
        throw new BadRequestError(
          'VALIDACION_ERROR',
          `El tipo debe coincidir con la categoría padre (${parent.tipo}).`,
        );
      }
      tipo = parent.tipo;
      // Inherit color from parent if not explicitly provided
      if (!payload.color_hex) {
        color_hex = parent.color_hex;
      }
    }

    const { data, error } = await supabase
      .from('categorias')
      .insert({
        usuario_id: userId,
        categoria_padre_id: payload.categoria_padre_id ?? null,
        nombre: payload.nombre.trim(),
        tipo,
        icono: payload.icono ?? 'circle',
        color_hex,
        es_sistema: false,
        slug,
      })
      .select(CATEGORY_SELECT)
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
    if (payload.icono !== undefined) updateData.icono = payload.icono;
    if (payload.color_hex !== undefined) updateData.color_hex = payload.color_hex;

    if (payload.categoria_padre_id !== undefined) {
      if (payload.categoria_padre_id) {
        const parent = await this.validateParentCategory(userId, payload.categoria_padre_id, categoryId);
        // If changing parent, validate tipo matches
        const currentTipo = (payload.tipo ?? category.tipo) as string;
        if (currentTipo !== parent.tipo) {
          throw new BadRequestError(
            'VALIDACION_ERROR',
            `El tipo debe coincidir con la categoría padre (${parent.tipo}).`,
          );
        }
      }
      updateData.categoria_padre_id = payload.categoria_padre_id;
    }

    if (payload.tipo !== undefined) {
      // If has a parent, validate tipo matches parent
      const parentId = payload.categoria_padre_id !== undefined
        ? payload.categoria_padre_id
        : category.categoria_padre_id;
      if (parentId) {
        const parent = await this.getParentCategory(userId, Number(parentId));
        if (parent && payload.tipo !== parent.tipo) {
          throw new BadRequestError(
            'VALIDACION_ERROR',
            `El tipo debe coincidir con la categoría padre (${parent.tipo}).`,
          );
        }
      }
      updateData.tipo = payload.tipo;
    }

    if (Object.keys(updateData).length === 0) {
      return category;
    }

    const { data, error } = await supabase
      .from('categorias')
      .update(updateData)
      .eq('categoria_id', categoryId)
      .eq('usuario_id', userId)
      .select(CATEGORY_SELECT)
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

  private mapCategory(row: any) {
    return {
      categoria_id: Number(row.categoria_id),
      categoria_padre_id: row.categoria_padre_id ? Number(row.categoria_padre_id) : null,
      usuario_id: row.usuario_id ? Number(row.usuario_id) : null,
      nombre: row.nombre,
      tipo: row.tipo,
      icono: row.icono,
      color_hex: row.color_hex,
      es_sistema: !!row.es_sistema,
      slug: row.slug,
      creado_en: row.creado_en,
    };
  }

  private async getOwnedMutableCategory(userId: number, categoryId: number) {
    const { data, error } = await supabase
      .from('categorias')
      .select(CATEGORY_SELECT)
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
  ) {
    if (currentCategoryId && currentCategoryId === parentId) {
      throw new BadRequestError('VALIDACION_ERROR', 'Una categoría no puede ser su propia categoría padre.');
    }

    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id, categoria_padre_id, usuario_id, es_sistema, tipo, color_hex')
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

    return data;
  }

  private async getParentCategory(userId: number, parentId: number) {
    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id, tipo, color_hex')
      .eq('categoria_id', parentId)
      .or(`es_sistema.eq.true,usuario_id.eq.${userId}`)
      .maybeSingle();

    if (error) return null;
    return data;
  }
}
