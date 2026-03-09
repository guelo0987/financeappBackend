import { z } from 'zod';
import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { CreateWalletDTO, SubtipoWallet, UpdateWalletDTO } from '../types/wallets.types';

const supabase: any = getSupabaseClient();

const createWalletSchema = z.object({
  nombre: z.string().min(1).max(120),
  subtipo: z.enum(['ahorro', 'gasto', 'deuda']),
  saldo: z.number().finite(),
  moneda: z.enum(['DOP', 'USD']).optional(),
  institucion_nombre: z.string().max(120).optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icono: z.string().min(1).max(80).optional(),
  ticker_simbolo: z.string().max(20).optional(),
  espacio_id: z.number().int().positive().nullable().optional(),
});

const updateWalletSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  subtipo: z.enum(['ahorro', 'gasto', 'deuda']).optional(),
  saldo: z.number().finite().optional(),
  moneda: z.enum(['DOP', 'USD']).optional(),
  institucion_nombre: z.string().max(120).nullable().optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icono: z.string().min(1).max(80).optional(),
  ticker_simbolo: z.string().max(20).nullable().optional(),
});

export class WalletsService {
  async getAll(userId: number) {
    const { data, error } = await supabase
      .from('activos')
      .select(
        'activo_id, usuario_id, nombre, subtipo, tipo, moneda, valor_actual, institucion_nombre, color_hex, icono, ticker_simbolo, espacio_id, creado_en, actualizado_en',
      )
      .eq('usuario_id', userId)
      .order('creado_en', { ascending: false });

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las cuentas.');
    }

    return (data ?? []).map((item: any) => this.toWalletResponse(item));
  }

  async getById(userId: number, walletId: number) {
    const wallet = await this.getOwnedWallet(userId, walletId);
    return this.toWalletResponse(wallet);
  }

  async create(userId: number, dto: CreateWalletDTO) {
    const parsed = createWalletSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    }

    const payload = parsed.data;
    const normalizedSaldo = Math.abs(payload.saldo);
    const tipo = this.deriveTipo(payload.subtipo);

    const { data, error } = await supabase
      .from('activos')
      .insert({
        usuario_id: userId,
        nombre: payload.nombre.trim(),
        subtipo: payload.subtipo,
        tipo,
        moneda: payload.moneda ?? 'DOP',
        valor_actual: normalizedSaldo,
        institucion_nombre: payload.institucion_nombre ?? null,
        color_hex: payload.color_hex ?? '#4F46E5',
        icono: payload.icono ?? 'landmark',
        ticker_simbolo: payload.ticker_simbolo ?? null,
        espacio_id: payload.espacio_id ?? null,
      })
      .select(
        'activo_id, usuario_id, nombre, subtipo, tipo, moneda, valor_actual, institucion_nombre, color_hex, icono, ticker_simbolo, espacio_id, creado_en, actualizado_en',
      )
      .single();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear la cuenta.');
    }

    return this.toWalletResponse(data);
  }

  async update(userId: number, walletId: number, dto: UpdateWalletDTO) {
    const parsed = updateWalletSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    }

    await this.getOwnedWallet(userId, walletId);
    const payload = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (payload.nombre !== undefined) updateData.nombre = payload.nombre.trim();
    if (payload.subtipo !== undefined) {
      updateData.subtipo = payload.subtipo;
      updateData.tipo = this.deriveTipo(payload.subtipo);
    }
    if (payload.saldo !== undefined) updateData.valor_actual = Math.abs(payload.saldo);
    if (payload.moneda !== undefined) updateData.moneda = payload.moneda;
    if (payload.institucion_nombre !== undefined) {
      updateData.institucion_nombre = payload.institucion_nombre;
    }
    if (payload.color_hex !== undefined) updateData.color_hex = payload.color_hex;
    if (payload.icono !== undefined) updateData.icono = payload.icono;
    if (payload.ticker_simbolo !== undefined) updateData.ticker_simbolo = payload.ticker_simbolo;

    if (Object.keys(updateData).length === 0) {
      return this.getById(userId, walletId);
    }

    updateData.actualizado_en = new Date().toISOString();

    const { data, error } = await supabase
      .from('activos')
      .update(updateData)
      .eq('activo_id', walletId)
      .eq('usuario_id', userId)
      .select(
        'activo_id, usuario_id, nombre, subtipo, tipo, moneda, valor_actual, institucion_nombre, color_hex, icono, ticker_simbolo, espacio_id, creado_en, actualizado_en',
      )
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar la cuenta.');
    }

    if (!data) {
      throw new NotFoundError('NOT_FOUND', 'Cuenta no encontrada.');
    }

    return this.toWalletResponse(data);
  }

  async softDelete(userId: number, walletId: number): Promise<void> {
    await this.getOwnedWallet(userId, walletId);

    const { error } = await supabase
      .from('activos')
      .delete()
      .eq('activo_id', walletId)
      .eq('usuario_id', userId);

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo eliminar la cuenta.');
    }
  }

  async getTransactions(userId: number, walletId: number, page: number, limit: number) {
    await this.getOwnedWallet(userId, walletId);

    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(100, limit));
    const from = (safePage - 1) * safeLimit;
    const to = from + safeLimit - 1;

    const baseQuery = supabase
      .from('transacciones')
      .select(
        'transaccion_id, usuario_id, activo_id, activo_destino_id, tipo, monto, moneda, categoria_id, descripcion, fecha, origen, nota, creado_en',
        { count: 'exact' },
      )
      .eq('usuario_id', userId)
      .or(`activo_id.eq.${walletId},activo_destino_id.eq.${walletId}`)
      .order('fecha', { ascending: false })
      .order('transaccion_id', { ascending: false })
      .range(from, to);

    const { data, error, count } = await baseQuery;

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las transacciones de la cuenta.');
    }

    const total = count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

    return {
      data: data ?? [],
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        hasMore: safePage < totalPages,
      },
    };
  }

  async getSummary(userId: number) {
    const wallets = await this.getAll(userId);

    const totalBalance = wallets
      .filter((wallet: any) => wallet.subtipo !== 'deuda')
      .reduce((acc: number, wallet: any) => acc + wallet.saldo, 0);
    const totalDebt = wallets
      .filter((wallet: any) => wallet.subtipo === 'deuda')
      .reduce((acc: number, wallet: any) => acc + Math.abs(wallet.saldo), 0);

    return {
      totalBalance,
      totalDebt,
      netWorth: totalBalance - totalDebt,
      walletsCount: wallets.length,
    };
  }

  private async getOwnedWallet(userId: number, walletId: number) {
    const { data, error } = await supabase
      .from('activos')
      .select(
        'activo_id, usuario_id, nombre, subtipo, tipo, moneda, valor_actual, institucion_nombre, color_hex, icono, ticker_simbolo, espacio_id, creado_en, actualizado_en',
      )
      .eq('activo_id', walletId)
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar la cuenta.');
    }

    if (!data) {
      throw new NotFoundError('NOT_FOUND', 'Cuenta no encontrada.');
    }

    return data;
  }

  private deriveTipo(subtipo: SubtipoWallet) {
    if (subtipo === 'gasto') return 'efectivo';
    return 'cuenta_bancaria';
  }

  private toWalletResponse(row: any) {
    const saldo = row.subtipo === 'deuda' ? -Number(row.valor_actual) : Number(row.valor_actual);
    return {
      id: Number(row.activo_id),
      nombre: row.nombre,
      subtipo: row.subtipo,
      tipo: row.tipo,
      saldo,
      moneda: row.moneda,
      institucion_nombre: row.institucion_nombre,
      color_hex: row.color_hex,
      icono: row.icono,
      ticker_simbolo: row.ticker_simbolo,
      espacio_id: row.espacio_id,
      creado_en: row.creado_en,
      actualizado_en: row.actualizado_en,
    };
  }
}
