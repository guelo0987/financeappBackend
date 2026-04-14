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

const TX_SELECT = [
  'transaccion_id, usuario_id, presupuesto_id, espacio_id, activo_id, activo_destino_id,',
  'tipo, monto, moneda, categoria_id, descripcion, fecha, origen, nota, creado_en, actualizado_en,',
  'categorias(categoria_id, slug, nombre, icono),',
  'usuarios(usuario_id, nombre),',
  'wallet_origen:activos!transacciones_activo_id_fkey(activo_id, nombre, tipo, moneda),',
  'wallet_destino:activos!transacciones_activo_destino_id_fkey(activo_id, nombre, tipo, moneda)',
].join(' ');

const createSchema = z.object({
  fecha: z.string().regex(dateRegex, 'fecha inválida, use YYYY-MM-DD'),
  descripcion: z.string().min(1).max(255),
  monto: z.number().positive(),
  tipo: z.enum(['ingreso', 'gasto', 'transferencia']),
  budgetId: z.number().int().positive().nullable().optional(),
  catKey: z.string().min(1).max(80).nullable().optional(),
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
  budgetId: z.number().int().positive().nullable().optional(),
  catKey: z.string().min(1).max(80).nullable().optional(),
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
      categoryId = (await this.resolveCategory(userId, filters.catKey))?.id ?? null;
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
        TX_SELECT,
        { count: 'exact' },
      );

    if (filters.budgetId) {
      await this.getAccessibleBudget(userId, filters.budgetId);
      query = query.eq('presupuesto_id', filters.budgetId);
    } else {
      query = query.eq('usuario_id', userId);
    }

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
        TX_SELECT,
      )
      .eq('transaccion_id', txnId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo cargar la transacción.');
    }
    if (!data) {
      throw new NotFoundError('NOT_FOUND', 'Transacción no encontrada.');
    }
    await this.assertTransactionVisible(userId, data);

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

    const budget = payload.budgetId
      ? await this.getAccessibleBudget(userId, payload.budgetId)
      : null;
    const wallet = await this.validateWalletOwnership(userId, payload.walletId);

    // Validate currency match between transaction and wallet
    const txnMoneda = payload.moneda ?? 'DOP';
    if (wallet.moneda && wallet.moneda !== txnMoneda) {
      throw new BadRequestError(
        'MONEDA_MISMATCH',
        `La moneda de la transacción (${txnMoneda}) no coincide con la de la cuenta (${wallet.moneda}).`,
      );
    }

    if (payload.toWalletId) await this.validateWalletOwnership(userId, payload.toWalletId);

    const category = await this.resolveCategory(userId, payload.catKey ?? null);
    const categoriaId = this.resolveTransactionCategoryId(
      payload.tipo,
      payload.catKey ?? null,
      category,
    );

    const { data, error } = await supabase
      .from('transacciones')
      .insert({
        usuario_id: userId,
        presupuesto_id: payload.budgetId ?? null,
        espacio_id: budget?.espacio_id ? Number(budget.espacio_id) : null,
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
        TX_SELECT,
      )
      .single();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear la transacción.');
    }

    await this.applyWalletAdjustments(userId, this.computeWalletAdjustments(data));

    return this.mapTransaction(data);
  }

  async update(userId: number, txnId: number, dto: UpdateTransactionDTO) {
    const parsed = updateSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    }
    const payload = parsed.data;
    const existing = await this.getById(userId, txnId);
    await this.assertTransactionWritable(userId, existing);
    const isOwner = Number(existing.userId) === userId;
    const nextBudgetId = payload.budgetId !== undefined
      ? payload.budgetId
      : existing.budgetId;
    const budget = nextBudgetId
      ? await this.getAccessibleBudget(userId, nextBudgetId)
      : null;

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

    if (!isOwner && (payload.walletId !== undefined || payload.toWalletId !== undefined)) {
      throw new NotFoundError(
        'NOT_FOUND_OR_FORBIDDEN',
        'Solo el creador puede cambiar las cuentas de la transacción.',
      );
    }

    if (payload.walletId !== undefined || isOwner) {
      const wallet = await this.validateWalletOwnership(userId, nextWalletId);
      const nextMoneda = payload.moneda ?? existing.moneda;
      if (wallet.moneda && nextMoneda && wallet.moneda !== nextMoneda) {
        throw new BadRequestError(
          'MONEDA_MISMATCH',
          `La moneda de la transacción (${nextMoneda}) no coincide con la de la cuenta (${wallet.moneda}).`,
        );
      }
    }
    if (typeof nextToWalletId === 'number' && (payload.toWalletId !== undefined || isOwner)) {
      await this.validateWalletOwnership(userId, nextToWalletId);
    }

    let categoriaId: number | null | undefined;
    const changingIntoTransfer = nextTipo === 'transferencia' && existing.tipo !== 'transferencia';
    if (payload.catKey !== undefined || payload.tipo !== undefined) {
      const effectiveCatKey =
        payload.catKey !== undefined
          ? payload.catKey
          : changingIntoTransfer
            ? null
            : (existing.catKey ?? null);
      const resolved = await this.resolveCategory(userId, effectiveCatKey);
      categoriaId = this.resolveTransactionCategoryId(nextTipo, effectiveCatKey, resolved);
    }

    const updateData: Record<string, unknown> = {};
    if (payload.fecha !== undefined) updateData.fecha = payload.fecha;
    if (payload.descripcion !== undefined) updateData.descripcion = payload.descripcion.trim();
    if (payload.monto !== undefined) updateData.monto = payload.monto;
    if (payload.tipo !== undefined) updateData.tipo = payload.tipo;
    if (payload.budgetId !== undefined) updateData.presupuesto_id = payload.budgetId;
    if (payload.walletId !== undefined) updateData.activo_id = payload.walletId;
    if (payload.toWalletId !== undefined) updateData.activo_destino_id = payload.toWalletId;
    if (payload.budgetId !== undefined) {
      updateData.espacio_id = budget?.espacio_id ? Number(budget.espacio_id) : null;
    }
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
      .select(
        TX_SELECT,
      )
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar la transacción.');
    }
    if (!data) {
      throw new NotFoundError('NOT_FOUND', 'Transacción no encontrada.');
    }

    const currentImpact = this.computeWalletAdjustments(existing);
    const nextImpact = this.computeWalletAdjustments(data);
    const netImpact = this.diffAdjustments(currentImpact, nextImpact);
    const ownerUserId = Number(existing.userId ?? userId);
    await this.applyWalletAdjustments(ownerUserId, netImpact);

    return this.mapTransaction(data);
  }

  async delete(userId: number, txnId: number): Promise<void> {
    const existing = await this.getById(userId, txnId);
    await this.assertTransactionWritable(userId, existing);

    const ownerUserId = Number(existing.userId ?? userId);

    const { error } = await supabase
      .from('transacciones')
      .delete()
      .eq('transaccion_id', txnId)
      .eq('usuario_id', ownerUserId); // defense-in-depth: scope to transaction owner

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo eliminar la transacción.');
    }

    const revertImpact = this.negateAdjustments(this.computeWalletAdjustments(existing));
    await this.applyWalletAdjustments(ownerUserId, revertImpact);
  }

  private async resolveCategory(
    userId: number,
    slug: string | null | undefined,
  ): Promise<{ id: number; tipo: string } | null> {
    if (!slug) return null;

    const { data, error } = await supabase
      .from('categorias')
      .select('categoria_id, usuario_id, es_sistema, tipo')
      .eq('slug', slug)
      .or(`es_sistema.eq.true,usuario_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo resolver la categoría.');
    }

    if (!data) return null;
    return { id: Number(data.categoria_id), tipo: String(data.tipo) };
  }

  private resolveTransactionCategoryId(
    tipo: string,
    catKey: string | null | undefined,
    category: { id: number; tipo: string } | null,
  ): number | null {
    if (tipo === 'transferencia') {
      if (catKey && !category) {
        throw new BadRequestError('CATEGORY_NOT_FOUND', 'La categoría indicada no existe.');
      }
      if (category && category.tipo !== 'transferencia') {
        throw new BadRequestError(
          'CATEGORY_TYPE_MISMATCH',
          'Las transferencias solo pueden usar categorías de transferencia.',
        );
      }
      return category?.id ?? null;
    }

    if (!catKey) {
      throw new BadRequestError(
        'VALIDACION_ERROR',
        'La categoría es obligatoria para ingresos y gastos.',
      );
    }
    if (!category) {
      throw new BadRequestError('CATEGORY_NOT_FOUND', 'La categoría indicada no existe.');
    }
    if (category.tipo !== tipo) {
      throw new BadRequestError(
        'CATEGORY_TYPE_MISMATCH',
        `La categoría indicada es de tipo ${category.tipo} y no coincide con este movimiento.`,
      );
    }

    return category.id;
  }

  private async validateWalletOwnership(userId: number, walletId: number): Promise<{ moneda: string }> {
    const { data, error } = await supabase
      .from('activos')
      .select('activo_id, moneda')
      .eq('activo_id', walletId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar la cuenta.');
    }

    if (!data) {
      throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'La cuenta indicada no existe o no pertenece al usuario.');
    }

    return { moneda: data.moneda };
  }

  private async assertSpaceMembership(userId: number, spaceId: number): Promise<string> {
    const { data, error } = await supabase
      .from('espacio_miembros')
      .select('rol')
      .eq('espacio_id', spaceId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar membresía del espacio.');
    }
    if (!data) {
      throw new NotFoundError(
        'NOT_FOUND_OR_FORBIDDEN',
        'No tiene acceso al espacio compartido indicado.',
      );
    }

    return String(data.rol ?? 'miembro');
  }

  private async assertTransactionVisible(userId: number, txn: any): Promise<void> {
    const budgetIdRaw = txn.presupuesto_id ?? txn.budgetId;
    const budgetId = budgetIdRaw === null || budgetIdRaw === undefined ? null : Number(budgetIdRaw);
    if (budgetId) {
      await this.getAccessibleBudget(userId, budgetId);
      return;
    }

    const ownerId = Number(txn.usuario_id ?? txn.userId);
    const spaceIdRaw = txn.espacio_id;
    const spaceId = spaceIdRaw === null || spaceIdRaw === undefined ? null : Number(spaceIdRaw);

    if (spaceId) {
      await this.assertSpaceMembership(userId, spaceId);
      return;
    }

    if (ownerId !== userId) {
      throw new NotFoundError('NOT_FOUND', 'Transacción no encontrada.');
    }
  }

  private async assertTransactionWritable(userId: number, txn: any): Promise<void> {
    const budgetIdRaw = txn.presupuesto_id ?? txn.budgetId;
    const budgetId = budgetIdRaw === null || budgetIdRaw === undefined ? null : Number(budgetIdRaw);
    const txnOwnerId = Number(txn.usuario_id ?? txn.userId);
    if (budgetId) {
      const budget = await this.getAccessibleBudget(userId, budgetId);
      // Budget owner can modify any transaction
      if (Number(budget.usuario_id) === userId) return;
      // Transaction creator can modify their own
      if (txnOwnerId === userId) return;
      // Space admin can modify any transaction
      const role = await this.assertSpaceMembership(userId, Number(budget.espacio_id));
      if (role !== 'admin') {
        throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'No puede modificar esta transacción.');
      }
      return;
    }

    const ownerId = Number(txn.usuario_id ?? txn.userId);
    const spaceIdRaw = txn.espacio_id;
    const spaceId = spaceIdRaw === null || spaceIdRaw === undefined ? null : Number(spaceIdRaw);

    if (!spaceId) {
      if (ownerId !== userId) {
        throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'No puede modificar esta transacción.');
      }
      return;
    }

    const role = await this.assertSpaceMembership(userId, spaceId);
    const isOwner = ownerId === userId;
    const isAdmin = role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'No puede modificar esta transacción.');
    }
  }

  private async getAccessibleBudget(userId: number, budgetId: number): Promise<any> {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('presupuesto_id, usuario_id, espacio_id, activo')
      .eq('presupuesto_id', budgetId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar el presupuesto.');
    }
    if (!data) {
      throw new NotFoundError('NOT_FOUND', 'Presupuesto no encontrado.');
    }
    if (Number(data.usuario_id) === userId) {
      return data;
    }
    if (data.espacio_id) {
      await this.assertSpaceMembership(userId, Number(data.espacio_id));
      return data;
    }
    throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'No tiene acceso al presupuesto indicado.');
  }

  private computeWalletAdjustments(tx: any): Map<number, number> {
    const map = new Map<number, number>();
    const tipo = String(tx.tipo);
    const monto = Number(tx.monto ?? 0);
    const fromWallet = tx.activo_id ? Number(tx.activo_id) : Number(tx.walletId ?? 0);
    const toWallet = tx.activo_destino_id
      ? Number(tx.activo_destino_id)
      : Number(tx.toWalletId ?? 0);

    if (!Number.isFinite(monto) || monto <= 0 || !fromWallet) return map;

    if (tipo === 'ingreso') {
      map.set(fromWallet, (map.get(fromWallet) ?? 0) + monto);
      return map;
    }

    if (tipo === 'gasto') {
      map.set(fromWallet, (map.get(fromWallet) ?? 0) - monto);
      return map;
    }

    if (tipo === 'transferencia') {
      map.set(fromWallet, (map.get(fromWallet) ?? 0) - monto);
      if (toWallet) {
        map.set(toWallet, (map.get(toWallet) ?? 0) + monto);
      }
      return map;
    }

    return map;
  }

  private diffAdjustments(
    previous: Map<number, number>,
    next: Map<number, number>,
  ): Map<number, number> {
    const out = new Map<number, number>();
    const keys = new Set<number>([...previous.keys(), ...next.keys()]);
    for (const key of keys) {
      const delta = (next.get(key) ?? 0) - (previous.get(key) ?? 0);
      if (Math.abs(delta) > 0) out.set(key, delta);
    }
    return out;
  }

  private negateAdjustments(input: Map<number, number>): Map<number, number> {
    const out = new Map<number, number>();
    for (const [walletId, delta] of input.entries()) {
      if (Math.abs(delta) > 0) out.set(walletId, -delta);
    }
    return out;
  }

  private async applyWalletAdjustments(userId: number, adjustments: Map<number, number>): Promise<void> {
    for (const [walletId, delta] of adjustments.entries()) {
      if (Math.abs(delta) === 0) continue;

      // Atomic adjustment via RPC — eliminates read-modify-write race condition.
      // The RPC handles deudas inversion internally and updates actualizado_en.
      const { error } = await supabase.rpc('adjust_wallet_balance', {
        p_wallet_id: walletId,
        p_user_id: userId,
        p_delta: delta,
      });

      if (error) {
        if (error.message?.includes('WALLET_NOT_FOUND')) {
          throw new NotFoundError('NOT_FOUND_OR_FORBIDDEN', 'La cuenta indicada no existe o no pertenece al usuario.');
        }
        throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el balance de la cuenta.');
      }
    }
  }

  private mapTransaction(row: any) {
    const category = Array.isArray(row.categorias) ? row.categorias[0] : row.categorias;
    const usuario = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
    const walletOrigen = Array.isArray(row.wallet_origen) ? row.wallet_origen[0] : row.wallet_origen;
    const walletDestino = Array.isArray(row.wallet_destino) ? row.wallet_destino[0] : row.wallet_destino;

    return {
      id: Number(row.transaccion_id),
      userId: row.usuario_id ? Number(row.usuario_id) : null,
      usuario: usuario ? { id: Number(usuario.usuario_id), nombre: usuario.nombre } : null,
      budgetId: row.presupuesto_id ? Number(row.presupuesto_id) : null,
      espacio_id: row.espacio_id ? Number(row.espacio_id) : null,
      walletId: row.activo_id ? Number(row.activo_id) : null,
      wallet: walletOrigen
        ? { id: Number(walletOrigen.activo_id), nombre: walletOrigen.nombre, tipo: walletOrigen.tipo, moneda: walletOrigen.moneda }
        : null,
      toWalletId: row.activo_destino_id ? Number(row.activo_destino_id) : null,
      wallet_destino: walletDestino
        ? { id: Number(walletDestino.activo_id), nombre: walletDestino.nombre, tipo: walletDestino.tipo, moneda: walletDestino.moneda }
        : null,
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
