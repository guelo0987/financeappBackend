import { User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../config/supabase';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/errors';
import {
  AuthSessionResponse,
  SupabaseSessionDTO,
  UpdateProfileDTO,
  UsuarioPublico,
} from '../types/auth.types';

const supabase: any = getSupabaseClient();

type SyncResult = {
  isNewUser: boolean;
  userId: number;
  usuario: UsuarioPublico;
};

export class AuthService {
  async verifySupabaseToken(accessToken: string): Promise<User> {
    const token = accessToken.trim();
    if (!token) {
      throw new UnauthorizedError('TOKEN_REQUERIDO', 'Se requiere un token de autenticación.');
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedError('TOKEN_INVALIDO', 'El token de Supabase es inválido o ha expirado.');
    }

    if (!user.email) {
      throw new UnauthorizedError('EMAIL_REQUERIDO', 'La cuenta autenticada no tiene un email disponible.');
    }

    return user;
  }

  async getUserIdBySupabaseAuthUserId(supabaseAuthUserId: string): Promise<number | null> {
    const { data, error } = await supabase
      .from('usuarios')
      .select('usuario_id')
      .eq('supabase_auth_user_id', supabaseAuthUserId)
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar el usuario autenticado.');
    }

    return data ? Number(data.usuario_id) : null;
  }

  async syncSupabaseUser(user: User, dto: SupabaseSessionDTO): Promise<AuthSessionResponse> {
    const result = await this.syncSupabaseUserInternal(user, dto);
    return {
      usuario: result.usuario,
      isNewUser: result.isNewUser,
    };
  }

  async getProfile(userId: number): Promise<UsuarioPublico> {
    const { data, error } = await supabase
      .from('usuarios')
      .select(
        'usuario_id, nombre, email, moneda_base, meta_financiera, meta_monto, meta_fecha, creado_en, presupuesto_default_id',
      )
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
      .select(
        'usuario_id, nombre, email, moneda_base, meta_financiera, meta_monto, meta_fecha, creado_en, presupuesto_default_id',
      )
      .maybeSingle();

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el perfil.');
    }

    if (!data) {
      throw new NotFoundError('USUARIO_NO_ENCONTRADO', 'El usuario no existe.');
    }

    return this.mapUsuarioPublico(data);
  }

  async setDefaultBudget(userId: number, presupuestoId: number | null): Promise<void> {
    if (presupuestoId !== null) {
      const { data } = await supabase
        .from('presupuestos')
        .select('presupuesto_id, usuario_id, espacio_id')
        .eq('presupuesto_id', presupuestoId)
        .maybeSingle();

      if (!data) throw new NotFoundError('NOT_FOUND', 'Presupuesto no encontrado.');

      const esPropio = Number(data.usuario_id) === userId;
      if (!esPropio && data.espacio_id) {
        const { data: member } = await supabase
          .from('espacio_miembros')
          .select('usuario_id')
          .eq('espacio_id', Number(data.espacio_id))
          .eq('usuario_id', userId)
          .maybeSingle();
        if (!member) throw new NotFoundError('NOT_FOUND', 'No tienes acceso a ese presupuesto.');
      } else if (!esPropio) {
        throw new NotFoundError('NOT_FOUND', 'No tienes acceso a ese presupuesto.');
      }
    }

    const { error } = await supabase
      .from('usuarios')
      .update({ presupuesto_default_id: presupuestoId })
      .eq('usuario_id', userId);

    if (error) {
      throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el presupuesto por defecto.');
    }
  }

  private async syncSupabaseUserInternal(user: User, dto: SupabaseSessionDTO): Promise<SyncResult> {
    const emailNormalizado = user.email!.toLowerCase().trim();
    const monedaBase = this.normalizarMonedaBase(dto.moneda_base);

    const { data: existentePorAuth, error: errorPorAuth } = await supabase
      .from('usuarios')
      .select(
        'usuario_id, nombre, email, moneda_base, meta_financiera, meta_monto, meta_fecha, creado_en, presupuesto_default_id',
      )
      .eq('supabase_auth_user_id', user.id)
      .maybeSingle();

    if (errorPorAuth) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar la cuenta autenticada.');
    }

    if (existentePorAuth) {
      return {
        isNewUser: false,
        userId: Number(existentePorAuth.usuario_id),
        usuario: this.mapUsuarioPublico(existentePorAuth),
      };
    }

    const { data: existentePorEmail, error: errorPorEmail } = await supabase
      .from('usuarios')
      .select(
        'usuario_id, supabase_auth_user_id, nombre, email, moneda_base, meta_financiera, meta_monto, meta_fecha, creado_en, presupuesto_default_id',
      )
      .eq('email', emailNormalizado)
      .maybeSingle();

    if (errorPorEmail) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar el email de la cuenta autenticada.');
    }

    if (existentePorEmail) {
      if (
        existentePorEmail.supabase_auth_user_id &&
        existentePorEmail.supabase_auth_user_id !== user.id
      ) {
        throw new ConflictError(
          'EMAIL_EXISTENTE',
          'Este email ya está vinculado a otra cuenta autenticada.',
        );
      }

      const updateData: Record<string, unknown> = {
        supabase_auth_user_id: user.id,
      };

      if (!existentePorEmail.nombre?.trim()) {
        updateData.nombre = this.obtenerNombreUsuario(user);
      }

      const { data: linkedUser, error: errorLink } = await supabase
        .from('usuarios')
        .update(updateData)
        .eq('usuario_id', existentePorEmail.usuario_id)
        .select(
          'usuario_id, nombre, email, moneda_base, meta_financiera, meta_monto, meta_fecha, creado_en, presupuesto_default_id',
        )
        .single();

      if (errorLink || !linkedUser) {
        throw new BadRequestError('DB_ERROR', 'No se pudo vincular la cuenta autenticada.');
      }

      await this.ensureInitialSubscription(Number(linkedUser.usuario_id));
      await this.acceptPendingInvitations(Number(linkedUser.usuario_id), emailNormalizado);

      return {
        isNewUser: false,
        userId: Number(linkedUser.usuario_id),
        usuario: this.mapUsuarioPublico(linkedUser),
      };
    }

    const { data: usuario, error: errorUsuario } = await supabase
      .from('usuarios')
      .insert({
        nombre: this.obtenerNombreUsuario(user),
        email: emailNormalizado,
        moneda_base: monedaBase,
        supabase_auth_user_id: user.id,
      })
      .select(
        'usuario_id, nombre, email, moneda_base, meta_financiera, meta_monto, meta_fecha, creado_en, presupuesto_default_id',
      )
      .single();

    if (errorUsuario || !usuario) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear el usuario autenticado.');
    }

    const userId = Number(usuario.usuario_id);
    await this.ensureInitialSubscription(userId);
    await this.acceptPendingInvitations(userId, emailNormalizado);

    return {
      isNewUser: true,
      userId,
      usuario: this.mapUsuarioPublico(usuario),
    };
  }

  private normalizarMonedaBase(monedaBase?: string): 'DOP' | 'USD' {
    if (!monedaBase) return 'DOP';
    if (monedaBase === 'DOP' || monedaBase === 'USD') return monedaBase;
    throw new BadRequestError('MONEDA_INVALIDA', 'La moneda base debe ser DOP o USD.');
  }

  private obtenerNombreUsuario(user: User): string {
    const metadata = user.user_metadata ?? {};
    const fullName = [
      metadata.full_name,
      metadata.given_name,
      metadata.family_name,
      metadata.name,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .trim();

    if (fullName) {
      return fullName;
    }

    const emailLocalPart = user.email?.split('@')[0]?.replace(/[._-]+/g, ' ')?.trim();
    if (emailLocalPart) {
      return emailLocalPart
        .split(' ')
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
    }

    return 'Usuario';
  }

  private async ensureInitialSubscription(userId: number): Promise<void> {
    const { data: suscripcionExistente, error: errorConsulta } = await supabase
      .from('suscripciones')
      .select('suscripcion_id')
      .eq('usuario_id', userId)
      .maybeSingle();

    if (errorConsulta) {
      throw new BadRequestError('DB_ERROR', 'No se pudo validar la suscripción del usuario.');
    }

    if (suscripcionExistente) return;

    const { error: errorSuscripcion } = await supabase.from('suscripciones').insert({
      usuario_id: userId,
      estado: 'prueba',
      plan: 'mensual',
    });

    if (errorSuscripcion) {
      throw new BadRequestError('DB_ERROR', 'No se pudo crear la suscripción inicial.');
    }
  }

  private async acceptPendingInvitations(userId: number, email: string): Promise<void> {
    const now = new Date().toISOString();

    const { data: invitations } = await supabase
      .from('espacio_invitaciones')
      .select('invitacion_id, espacio_id, espacios_compartidos(nombre)')
      .eq('email_invitado', email)
      .eq('estado', 'pendiente')
      .gte('expira_en', now);

    if (!invitations?.length) return;

    for (const inv of invitations) {
      const espacioNombre = Array.isArray(inv.espacios_compartidos)
        ? inv.espacios_compartidos[0]?.nombre
        : inv.espacios_compartidos?.nombre;

      const { data: presupuesto } = await supabase
        .from('presupuestos')
        .select('presupuesto_id')
        .eq('espacio_id', inv.espacio_id)
        .maybeSingle();

      await supabase.from('espacio_miembros').upsert(
        {
          espacio_id: inv.espacio_id,
          usuario_id: userId,
          rol: 'miembro',
        },
        { onConflict: 'espacio_id,usuario_id' },
      );

      await supabase
        .from('espacio_invitaciones')
        .update({ estado: 'aceptada' })
        .eq('invitacion_id', inv.invitacion_id);

      const { error: alertError } = await supabase.from('alertas').insert({
        usuario_id: userId,
        tipo: 'invitacion_aceptada',
        titulo: 'Te uniste a un presupuesto compartido',
        cuerpo: `Ahora eres miembro del presupuesto "${espacioNombre ?? 'compartido'}". Ya puedes ver y registrar transacciones.`,
        datos_extra: {
          espacio_id: inv.espacio_id,
          presupuesto_id: presupuesto ? Number(presupuesto.presupuesto_id) : null,
          budget_nombre: espacioNombre ?? null,
        },
        espacio_id: inv.espacio_id,
      });
      if (alertError) console.error('Error creando alerta de invitación aceptada:', alertError);
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
      presupuesto_default_id: usuario.presupuesto_default_id
        ? Number(usuario.presupuesto_default_id)
        : null,
    };
  }
}
