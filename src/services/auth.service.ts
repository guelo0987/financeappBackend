import bcrypt from 'bcrypt';
import { getSupabaseClient } from '../config/supabase';
import { env } from '../config/env';
import { generarAccessToken, generarRefreshToken, verificarToken } from '../utils/jwt';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/errors';
import {
  AuthResponse,
  ChangePasswordDTO,
  LoginDTO,
  LoginResponse,
  RefreshDTO,
  RegisterDTO,
  UpdateProfileDTO,
  UsuarioPublico,
} from '../types/auth.types';

const SALT_ROUNDS = env.BCRYPT_ROUNDS;
const supabase: any = getSupabaseClient();

export class AuthService {
  async register(dto: RegisterDTO): Promise<AuthResponse> {
    this.validarRegistro(dto);

    const emailNormalizado = dto.email.toLowerCase().trim();

    const { data: existente, error: errorExistente } = await supabase
      .from('usuarios')
      .select('usuario_id')
      .eq('email', emailNormalizado)
      .maybeSingle();

    if (errorExistente) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar el email.');
    }

    if (existente) {
      throw new ConflictError('EMAIL_EXISTENTE', 'Ya existe una cuenta con este email.');
    }

    const password_hash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const { data: usuario, error: errorUsuario } = await supabase
      .from('usuarios')
      .insert({
        nombre: dto.nombre.trim(),
        email: emailNormalizado,
        password_hash,
        moneda_base: dto.moneda_base ?? 'DOP',
      })
      .select(
        'usuario_id, nombre, email, moneda_base, meta_financiera, meta_monto, meta_fecha, creado_en',
      )
      .single();

    if (errorUsuario || !usuario) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear el usuario.');
    }

    const { error: errorSuscripcion } = await supabase.from('suscripciones').insert({
      usuario_id: usuario.usuario_id,
      estado: 'prueba',
      plan: 'mensual',
    });

    if (errorSuscripcion) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear la suscripción inicial.');
    }

    const { error: errorBudget } = await supabase.from('presupuestos').insert({
      usuario_id: usuario.usuario_id,
      nombre: 'Predeterminado',
      periodo: 'mensual',
      dia_inicio: 1,
      ingresos: 0,
      ahorro_objetivo: 0,
      activo: true,
      espacio_id: null,
    });

    if (errorBudget) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear el presupuesto predeterminado.');
    }

    const userId = Number(usuario.usuario_id);
    return {
      usuario: this.mapUsuarioPublico(usuario),
      accessToken: generarAccessToken(userId, usuario.email),
      refreshToken: generarRefreshToken(userId, usuario.email),
    };
  }

  async login(dto: LoginDTO): Promise<LoginResponse> {
    if (!dto.email || !dto.password) {
      throw new BadRequestError('CAMPOS_REQUERIDOS', 'Los campos email y password son obligatorios.');
    }

    const emailNormalizado = dto.email.toLowerCase().trim();

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select(
        'usuario_id, nombre, email, moneda_base, meta_financiera, meta_monto, meta_fecha, creado_en, password_hash, suscripciones(estado, plan, trial_fin, periodo_fin)',
      )
      .eq('email', emailNormalizado)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo realizar el inicio de sesión.');
    }

    if (!usuario) {
      throw new UnauthorizedError('CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
    }

    const passwordValido = await bcrypt.compare(dto.password, usuario.password_hash);

    if (!passwordValido) {
      throw new UnauthorizedError('CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
    }

    const userId = Number(usuario.usuario_id);
    const suscripcion = Array.isArray(usuario.suscripciones)
      ? usuario.suscripciones[0] ?? null
      : usuario.suscripciones;

    return {
      usuario: this.mapUsuarioPublico(usuario),
      suscripcion,
      accessToken: generarAccessToken(userId, usuario.email),
      refreshToken: generarRefreshToken(userId, usuario.email),
    };
  }

  async refresh(dto: RefreshDTO) {
    if (!dto.refreshToken) {
      throw new BadRequestError('REFRESH_REQUERIDO', 'El refresh token es requerido.');
    }

    let payload;
    try {
      payload = verificarToken(dto.refreshToken);
    } catch {
      throw new UnauthorizedError('TOKEN_INVALIDO', 'Refresh token inválido o expirado.');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('TOKEN_INVALIDO', 'El token recibido no es refresh token.');
    }

    const usuario = await this.getProfile(payload.sub);

    return {
      accessToken: generarAccessToken(payload.sub, usuario.email),
      refreshToken: generarRefreshToken(payload.sub, usuario.email),
    };
  }

  async logout(_userId: number): Promise<void> {
    // Flujo stateless por ahora. Si agregamos almacenamiento de refresh tokens,
    // aquí se invalidan en DB.
    return;
  }

  async getProfile(userId: number): Promise<UsuarioPublico> {
    const { data, error } = await supabase
      .from('usuarios')
      .select('usuario_id, nombre, email, moneda_base, meta_financiera, meta_monto, meta_fecha, creado_en')
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo cargar el perfil.');
    }

    if (!data) {
      throw new NotFoundError('USUARIO_NO_ENCONTRADO', 'El usuario no existe.');
    }

    return this.mapUsuarioPublico(data);
  }

  async updateProfile(userId: number, dto: UpdateProfileDTO): Promise<UsuarioPublico> {
    if (dto.moneda_base && !['DOP', 'USD'].includes(dto.moneda_base)) {
      throw new BadRequestError('MONEDA_INVALIDA', 'La moneda base debe ser DOP o USD.');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.nombre !== undefined) updateData.nombre = dto.nombre.trim();
    if (dto.moneda_base !== undefined) updateData.moneda_base = dto.moneda_base;
    if (dto.meta_financiera !== undefined) updateData.meta_financiera = dto.meta_financiera;
    if (dto.meta_monto !== undefined) updateData.meta_monto = dto.meta_monto;
    if (dto.meta_fecha !== undefined) updateData.meta_fecha = dto.meta_fecha;

    const { data, error } = await supabase
      .from('usuarios')
      .update(updateData)
      .eq('usuario_id', userId)
      .select('usuario_id, nombre, email, moneda_base, meta_financiera, meta_monto, meta_fecha, creado_en')
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el perfil.');
    }

    if (!data) {
      throw new NotFoundError('USUARIO_NO_ENCONTRADO', 'El usuario no existe.');
    }

    return this.mapUsuarioPublico(data);
  }

  async changePassword(userId: number, dto: ChangePasswordDTO): Promise<void> {
    if (!dto.currentPassword || !dto.newPassword) {
      throw new BadRequestError(
        'CAMPOS_REQUERIDOS',
        'Los campos currentPassword y newPassword son obligatorios.',
      );
    }

    if (dto.newPassword.length < 8) {
      throw new BadRequestError('PASSWORD_DEBIL', 'La contraseña debe tener al menos 8 caracteres.');
    }

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('usuario_id, password_hash')
      .eq('usuario_id', userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar la contraseña actual.');
    }

    if (!usuario) {
      throw new NotFoundError('USUARIO_NO_ENCONTRADO', 'El usuario no existe.');
    }

    const passwordValido = await bcrypt.compare(dto.currentPassword, usuario.password_hash);
    if (!passwordValido) {
      throw new UnauthorizedError('CREDENCIALES_INVALIDAS', 'La contraseña actual es incorrecta.');
    }

    const password_hash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    const { error: updateError } = await supabase
      .from('usuarios')
      .update({ password_hash })
      .eq('usuario_id', userId);

    if (updateError) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar la contraseña.');
    }
  }

  private validarRegistro(dto: RegisterDTO): void {
    if (!dto.nombre || !dto.email || !dto.password) {
      throw new BadRequestError('CAMPOS_REQUERIDOS', 'Los campos nombre, email y password son obligatorios.');
    }

    if (dto.password.length < 8) {
      throw new BadRequestError('PASSWORD_DEBIL', 'La contraseña debe tener al menos 8 caracteres.');
    }

    if (dto.moneda_base && !['DOP', 'USD'].includes(dto.moneda_base)) {
      throw new BadRequestError('MONEDA_INVALIDA', 'La moneda base debe ser DOP o USD.');
    }
  }

  private mapUsuarioPublico(usuario: any): UsuarioPublico {
    return {
      usuario_id: usuario.usuario_id,
      nombre: usuario.nombre,
      email: usuario.email,
      moneda_base: usuario.moneda_base,
      meta_financiera: usuario.meta_financiera,
      meta_monto: usuario.meta_monto,
      meta_fecha: usuario.meta_fecha,
      creado_en: usuario.creado_en,
    };
  }
}
