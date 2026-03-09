import { z } from 'zod';
import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, NotFoundError } from '../utils/errors';
import {
  CreateTransactionDTO,
  TransactionFilters,
  UpdateTransactionDTO,
} from '../types/transactions.types';

const supabase: any = getSupabaseClient();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  fecha: z.string().regex(dateRegex, 'fecha inválida, use YYYY-MM-DD'),
  descripcion: z.string().min(1).max(255),
  monto: z.number().positive(),
  tipo: z.enum(['ingreso', 'gasto', 'transferencia']),
  catKey: z.string().min(1).max(80),
  walletId: z.number().int().positive(),
  toWalletId: z.number().int().positive().optional(),
  nota: z.string().max(500).optional(),
  moneda: z.enum(['DOP', 'USD']).optional(),
});

const updateSchema = z.object({
  fecha: z.string().regex(dateRegex).optional(),
  descripcion: z.string().min(1).max(255).optional(),
  monto: z.number().positive().optional(),
  tipo: z.enum(['ingreso', 'gasto', 'transferencia']).optional(),
  catKey: z.string().min(1).max(80).optional(),
  walletId: z.number().int().positive().optional(),
  toWalletId: z.number().int().positive().nullable().optional(),
  nota: z.string().max(500).nullable().optional(),
  moneda: z.enum(['DOP', 'USD']).optional(),
});

export class TransactionsService {
  async getAll(userId: number, filters: TransactionFilters) {
    const page = Math.max(1, Number(filters.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(filters.limit ?? 20)));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let categoryId: number | null = null;
    if (filters.catKey) {
      categoryId = await this.resolveCategoryId(userId, filters.catKey);
      if (!categoryId) {
        return {
          data: [],
          meta: { page, limit, total: 0, totalPages: 0, hasMore: false },
        };
      }
    }

    let query = supabase
      .from('transacciones')
      .select(
        'transaccion_id, usuario_id, activo_id, activo_destino_id, tipo, monto, moneda, categoria_id, descripcion, fecha, origen, nota, creado_en, actualizado_en, categorias(categoria_id, slug, nombre, icono, color_hex)',
        { count: 'exact' },
      )
      .eq('usuario_id', userId);

    if (filters.tipo) query = query.eq('tipo', filters.tipo);
    if (categoryId) query = query.eq('categoria_id', categoryId);
    if (filters.desde) query = query.gte('fecha', filters.desde);
    if (filters.hasta) query = query.lte('fecha', filters.hasta);
    if (filters.search) query = query.ilike('descripcion', `%${filters.search}%`);
    if (filters.walletId) {
      query = query.or(`activo_id.eq.${filters.walletId},activo_destino_id.eq.${filters.walletId}`);
    }

    const { data, error, count } = await query
      .order('fecha', { ascending: false })
      .order('transaccion_id', { ascending: false })
      .range(from, to);

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las transacciones.');
    }

    const total = count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: (data ?? []).map((row: any) => this.mapTransaction(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async getById(userId: number, txnId: number) {
    const { data, error } = await supabase
      .from('transacciones')
      .select(
        'transaccion_id, usuario_id, activo_id, activo_destino_id, tipo, monto, moneda, categoria_id, descripcion, fecha, origen, nota, creado_en, actualizado_en, categorias(categoria_id, slug, nombre, icono, color_hex)',
      )
      .eq('usuario_id', userId)
      .eq('transaccion_id', txnId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo cargar la transacción.');
    }
    if (!data) {
      throw new NotFoundError('NOT_FOUND', 'Transacción no encontrada.');
    }

    return this.mapTransaction(data);
  }

  async create(userId: number, dto: CreateTransactionDTO) {
    const parsed = createSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    }
    const payload = parsed.data;

    if (payload.tipo === 'transferencia') {
      if (!payload.toWalletId) {
        throw new BadRequestError('VALIDACION_ERROR', 'toWalletId es requerido para transferencias.');
      }
      if (payload.walletId === payload.toWalletId) {
        throw new BadRequestError('TRANSFER_SAME_WALLET', 'No puede transferir a la misma cuenta.');
      }
    }

    await this.validateWalletOwnership(userId, payload.walletId);
    if (payload.toWalletId) await this.validateWalletOwnership(userId, payload.toWalletId);

    const categoriaId = await this.resolveCategoryId(userId, payload.catKey);
    if (!categoriaId) {
      throw new BadRequestError('CATEGORY_NOT_FOUND', 'La categoría indicada no existe.');
    }

    const { data, error } = await supabase
      .from('transacciones')
      .insert({
        usuario_id: userId,
        activo_id: payload.walletId,
        activo_destino_id: payload.tipo === 'transferencia' ? payload.toWalletId : null,
        tipo: payload.tipo,
        monto: payload.monto,
        moneda: payload.moneda ?? 'DOP',
        categoria_id: categoriaId,
        descripcion: payload.descripcion.trim(),
        fecha: payload.fecha,
        origen: 'app',
        nota: payload.nota ?? null,
      })
      .select(
        'transaccion_id, usuario_id, activo_id, activo_destino_id, tipo, monto, moneda, categoria_id, descripcion, fecha, origen, nota, creado_en, actualizado_en, categorias(categoria_id, slug, nombre, icono, color_hex)',
      )
      .single();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear la transacción.');
    }

    return this.mapTransaction(data);
  }

  async update(userId: number, txnId: number, dto: UpdateTransactionDTO) {
    const parsed = updateSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    }
    const payload = parsed.data;
    const existing = await this.getById(userId, txnId);

    const nextTipo = payload.tipo ?? existing.tipo;
    const nextWalletId = payload.walletId ?? existing.walletId;
    const nextToWalletId =
      payload.toWalletId !== undefined ? payload.toWalletId : existing.toWalletId ?? undefined;

    if (!nextWalletId) {
      throw new BadRequestError('VALIDACION_ERROR', 'La transacción requiere walletId.');
    }

    if (nextTipo === 'transferencia') {
      if (!nextToWalletId) {
        throw new BadRequestError('VALIDACION_ERROR', 'toWalletId es requerido para transferencias.');
      }
      if (nextWalletId === nextToWalletId) {
        throw new BadRequestError('TRANSFER_SAME_WALLET', 'No puede transferir a la misma cuenta.');
      }
    }

    await this.validateWalletOwnership(userId, nextWalletId);
    if (typeof nextToWalletId === 'number') {
      await this.validateWalletOwnership(userId, nextToWalletId);
    }

    let categoriaId: number | undefined;
    if (payload.catKey !== undefined) {
      const resolved = await this.resolveCategoryId(userId, payload.catKey);
      if (!resolved) {
        throw new BadRequestError('CATEGORY_NOT_FOUND', 'La categoría indicada no existe.');
      }
      categoriaId = resolved;
    }

    const updateData: Record<string, unknown> = {};
    if (payload.fecha !== undefined) updateData.fecha = payload.fecha;
    if (payload.descripcion !== undefined) updateData.descripcion = payload.descripcion.trim();
    if (payload.monto !== undefined) updateData.monto = payload.monto;
    if (payload.tipo !== undefined) updateData.tipo = payload.tipo;
    if (payload.walletId !== undefined) updateData.activo_id = payload.walletId;
    if (payload.toWalletId !== undefined) updateData.activo_destino_id = payload.toWalletId;
    if (payload.nota !== undefined) updateData.nota = payload.nota;
    if (payload.moneda !== undefined) updateData.moneda = payload.moneda;
    if (categoriaId !== undefined) updateData.categoria_id = categoriaId;
    if ((payload.tipo ?? existing.tipo) !== 'transferencia' && payload.toWalletId === undefined) {
      updateData.activo_destino_id = null;
    }
    updateData.actualizado_en = new Date().toISOString();

    const { data, error } = await supabase
      .from('transacciones')
      .update(updateData)
      .eq('transaccion_id', txnId)
      .eq('usuario_id', userId)
      .select(
        'transaccion_id, usuario_id, activo_id, activo_destino_id, tipo, monto, moneda, categoria_id, descripcion, fecha, origen, nota, creado_en, actualizado_en, categorias(categoria_id, slug, nombre, icono, color_hex)',
      )
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar la transacción.');
    }
    if (!data) {
      throw new NotFoundError('NOT_FOUND', 'Transacción no encontrada.');
    }

    return this.mapTransaction(data);
  }

  async delete(userId: number, txnId: number): Promise<void> {
    const { error } = await supabase
      .from('transacciones')
      .delete()
      .eq('transaccion_id', txnId)
      .eq('usuario_id', userId);

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo eliminar la transacción.');
    }
  }

  private async resolveCategoryId(userId: number, slug: string): Promise<number | null> {
    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id, usuario_id, es_sistema')
      .eq('slug', slug)
      .or(`es_sistema.eq.true,usuario_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo resolver la categoría.');
    }

    if (!data) return null;
    return Number(data.categoria_id);
  }

  private async validateWalletOwnership(userId: number, walletId: number): Promise<void> {
    const { data, error } = await supabase
      .from('activos')
      .select('activo_id')
      .eq('activo_id', walletId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar la cuenta.');
    }

    if (!data) {
      throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'La cuenta indicada no existe o no pertenece al usuario.');
    }
  }

  private mapTransaction(row: any) {
    const category = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
    return {
      id: Number(row.transaccion_id),
      walletId: row.activo_id ? Number(row.activo_id) : null,
      toWalletId: row.activo_destino_id ? Number(row.activo_destino_id) : null,
      tipo: row.tipo,
      monto: Number(row.monto),
      moneda: row.moneda,
      catId: row.categoria_id ? Number(row.categoria_id) : null,
      catKey: category?.slug ?? null,
      categoria: category
        ? {
            id: Number(category.categoria_id),
            slug: category.slug,
            nombre: category.nombre,
            icono: category.icono,
            color_hex: category.color_hex,
          }
        : null,
      descripcion: row.descripcion,
      fecha: row.fecha,
      origen: row.origen,
      nota: row.nota,
      creado_en: row.creado_en,
      actualizado_en: row.actualizado_en,
    };
  }
}
