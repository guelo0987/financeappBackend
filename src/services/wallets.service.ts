import { z } from 'zod';
import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { CreateWalletDTO, UpdateWalletDTO } from '../types/wallets.types';

const supabase: any = getSupabaseClient();

const WALLET_SELECT =
  'activo_id, usuario_id, nombre, tipo, moneda, valor_actual, color_hex, icono, incluir_en_patrimonio, creado_en, actualizado_en';

const createWalletSchema = z.object({
  nombre: z.string().min(1).max(120),
  tipo: z.enum(['gastos', 'cuentas', 'deudas']),
  saldo: z.number().finite(),
  moneda: z.enum(['DOP', 'USD']).optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icono: z.string().min(1).max(80).optional(),
  incluir_en_patrimonio: z.boolean().optional(),
});

const updateWalletSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  tipo: z.enum(['gastos', 'cuentas', 'deudas']).optional(),
  saldo: z.number().finite().optional(),
  moneda: z.enum(['DOP', 'USD']).optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icono: z.string().min(1).max(80).optional(),
  incluir_en_patrimonio: z.boolean().optional(),
});

export class WalletsService {
  async getAll(userId: number) {
    const defaultId = await this.getDefaultWalletId(userId);

    const { data, error } = await supabase
      .from('activos')
      .select(WALLET_SELECT)
      .eq('usuario_id', userId)
      .order('creado_en', { ascending: false });

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las cuentas.');
    }

    return (data ?? []).map((item: any) => this.toWalletResponse(item, defaultId));
  }

  async getById(userId: number, walletId: number) {
    const wallet = await this.getOwnedWallet(userId, walletId);
    const defaultId = await this.getDefaultWalletId(userId);
    return this.toWalletResponse(wallet, defaultId);
  }

  async create(userId: number, dto: CreateWalletDTO) {
    const parsed = createWalletSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestError('VALIDACION_ERROR', parsed.error.message);
    }

    const payload = parsed.data;
    const normalizedSaldo = Math.abs(payload.saldo);

    const { data, error } = await supabase
      .from('activos')
      .insert({
        usuario_id: userId,
        nombre: payload.nombre.trim(),
        tipo: payload.tipo,
        moneda: payload.moneda ?? 'DOP',
        valor_actual: normalizedSaldo,
        color_hex: payload.color_hex ?? '#4F46E5',
        icono: payload.icono ?? 'landmark',
        incluir_en_patrimonio: payload.incluir_en_patrimonio ?? true,
      })
      .select(WALLET_SELECT)
      .single();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear la cuenta.');
    }

    // Auto-set as default if it's the user's first wallet
    const walletId = Number(data.activo_id);
    const currentDefault = await this.getDefaultWalletId(userId);
    if (!currentDefault) {
      await this.setDefaultWalletId(userId, walletId);
      return this.toWalletResponse(data, walletId);
    }

    return this.toWalletResponse(data, currentDefault);
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
    if (payload.tipo !== undefined) updateData.tipo = payload.tipo;
    if (payload.saldo !== undefined) updateData.valor_actual = Math.abs(payload.saldo);
    if (payload.moneda !== undefined) updateData.moneda = payload.moneda;
    if (payload.color_hex !== undefined) updateData.color_hex = payload.color_hex;
    if (payload.icono !== undefined) updateData.icono = payload.icono;
    if (payload.incluir_en_patrimonio !== undefined) updateData.incluir_en_patrimonio = payload.incluir_en_patrimonio;

    if (Object.keys(updateData).length === 0) {
      return this.getById(userId, walletId);
    }

    updateData.actualizado_en = new Date().toISOString();

    const { data, error } = await supabase
      .from('activos')
      .update(updateData)
      .eq('activo_id', walletId)
      .eq('usuario_id', userId)
      .select(WALLET_SELECT)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar la cuenta.');
    }

    if (!data) {
      throw new NotFoundError('NOT_FOUND', 'Cuenta no encontrada.');
    }

    const defaultId = await this.getDefaultWalletId(userId);
    return this.toWalletResponse(data, defaultId);
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

    // If deleted wallet was default, clear it
    const currentDefault = await this.getDefaultWalletId(userId);
    if (currentDefault === walletId) {
      await this.setDefaultWalletId(userId, null);
    }
  }

  async setDefault(userId: number, walletId: number) {
    await this.getOwnedWallet(userId, walletId);
    await this.setDefaultWalletId(userId, walletId);
    return { activo_default_id: walletId };
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

    const patrimonio = wallets.filter((w: any) => w.incluir_en_patrimonio);

    const totalBalance = patrimonio
      .filter((w: any) => w.tipo !== 'deudas')
      .reduce((acc: number, w: any) => acc + w.saldo, 0);
    const totalDebt = patrimonio
      .filter((w: any) => w.tipo === 'deudas')
      .reduce((acc: number, w: any) => acc + Math.abs(w.saldo), 0);

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
      .select(WALLET_SELECT)
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
  private async getDefaultWalletId(userId: number): Promise<number | null> {
    const { data, error } = await supabase
      .from('usuarios')
      .select('activo_default_id')
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return data.activo_default_id ? Number(data.activo_default_id) : null;
  }

  private async setDefaultWalletId(userId: number, walletId: number | null): Promise<void> {
    const { error } = await supabase
      .from('usuarios')
      .update({ activo_default_id: walletId })
      .eq('usuario_id', userId);

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar la cuenta por defecto.');
    }
  }

  private toWalletResponse(row: any, defaultWalletId?: number | null) {
    const saldo = row.tipo === 'deudas' ? -Number(row.valor_actual) : Number(row.valor_actual);
    return {
      id: Number(row.activo_id),
      nombre: row.nombre,
      tipo: row.tipo,
      saldo,
      moneda: row.moneda,
      color_hex: row.color_hex,
      icono: row.icono,
      es_default: Number(row.activo_id) === defaultWalletId,
      incluir_en_patrimonio: row.incluir_en_patrimonio ?? true,
      creado_en: row.creado_en,
      actualizado_en: row.actualizado_en,
    };
  }
}
