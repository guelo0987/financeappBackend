import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { EmailService } from './email.service';

const supabase: any = getSupabaseClient();
const emailService = new EmailService();

export class SpacesService {
  async listSpaces(userId: number) {
    const { data, error } = await supabase
      .from('espacio_miembros')
      .select(
        'espacio_id, rol, unido_en, espacios_compartidos(espacio_id, nombre, descripcion, creado_por, creado_en, actualizado_en)',
      )
      .eq('usuario_id', userId)
      .order('unido_en', { ascending: false });

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar los espacios.');

    return (data ?? []).map((row: any) => {
      const space = Array.isArray(row.espacios_compartidos)
        ? row.espacios_compartidos[0]
        : row.espacios_compartidos;
      return {
        id: Number(space.espacio_id),
        nombre: space.nombre,
        descripcion: space.descripcion,
        creado_por: Number(space.creado_por),
        rol: row.rol,
        creado_en: space.creado_en,
        actualizado_en: space.actualizado_en,
        unido_en: row.unido_en,
      };
    });
  }

  async createSpace(userId: number, nombre: string, descripcion?: string | null) {
    if (!nombre || !nombre.trim()) {
      throw new BadRequestError('VALIDACION_ERROR', 'El nombre es requerido.');
    }

    const { data: space, error } = await supabase
      .from('espacios_compartidos')
      .insert({
        nombre: nombre.trim(),
        descripcion: descripcion ?? null,
        creado_por: userId,
      })
      .select('espacio_id, nombre, descripcion, creado_por, creado_en, actualizado_en')
      .single();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo crear el espacio.');

    const { error: memberError } = await supabase.from('espacio_miembros').insert({
      espacio_id: space.espacio_id,
      usuario_id: userId,
      rol: 'admin',
    });

    if (memberError) throw new BadRequestError('DB_ERROR', 'No se pudo crear la membresía del espacio.');

    return {
      id: Number(space.espacio_id),
      nombre: space.nombre,
      descripcion: space.descripcion,
      creado_por: Number(space.creado_por),
      creado_en: space.creado_en,
      actualizado_en: space.actualizado_en,
    };
  }

  async getSpace(userId: number, spaceId: number) {
    await this.assertMember(userId, spaceId);

    const [{ data: space, error: spaceError }, { data: members, error: membersError }] =
      await Promise.all([
        supabase
          .from('espacios_compartidos')
          .select('espacio_id, nombre, descripcion, creado_por, creado_en, actualizado_en')
          .eq('espacio_id', spaceId)
          .maybeSingle(),
        supabase
          .from('espacio_miembros')
          .select('usuario_id, rol, unido_en, usuarios(usuario_id, nombre, email)')
          .eq('espacio_id', spaceId)
          .order('unido_en', { ascending: true }),
      ]);

    if (spaceError || !space) throw new NotFoundError('NOT_FOUND', 'Espacio no encontrado.');
    if (membersError) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar los miembros.');

    return {
      id: Number(space.espacio_id),
      nombre: space.nombre,
      descripcion: space.descripcion,
      creado_por: Number(space.creado_por),
      creado_en: space.creado_en,
      actualizado_en: space.actualizado_en,
      miembros: (members ?? []).map((row: any) => {
        const user = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
        return {
          usuario_id: Number(row.usuario_id),
          rol: row.rol,
          unido_en: row.unido_en,
          nombre: user?.nombre ?? null,
          email: user?.email ?? null,
        };
      }),
    };
  }

  async deleteSpace(userId: number, spaceId: number) {
    await this.assertAdmin(userId, spaceId);
    const { error } = await supabase.from('espacios_compartidos').delete().eq('espacio_id', spaceId);
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo eliminar el espacio.');
  }

  async inviteMember(userId: number, spaceId: number, email: string) {
    await this.assertAdmin(userId, spaceId);
    const normalizedEmail = email?.toLowerCase().trim();
    if (!normalizedEmail) throw new BadRequestError('VALIDACION_ERROR', 'El email es requerido.');

    const { data: existingPending, error: pendingError } = await supabase
      .from('espacio_invitaciones')
      .select('invitacion_id')
      .eq('espacio_id', spaceId)
      .eq('email_invitado', normalizedEmail)
      .eq('estado', 'pendiente')
      .gte('expira_en', new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (pendingError) throw new BadRequestError('DB_ERROR', 'No se pudo validar invitación existente.');
    if (existingPending) {
      throw new BadRequestError('SPACE_INVITE_PENDING', 'Ya existe una invitación pendiente para ese email.');
    }

    const { data, error } = await supabase
      .from('espacio_invitaciones')
      .insert({
        espacio_id: spaceId,
        invitado_por: userId,
        email_invitado: normalizedEmail,
      })
      .select('invitacion_id, espacio_id, email_invitado, token, estado, expira_en, creado_en')
      .single();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo crear la invitación.');

    const [{ data: user }, { data: space }] = await Promise.all([
      supabase.from('usuarios').select('nombre').eq('usuario_id', userId).single(),
      supabase.from('espacios_compartidos').select('nombre').eq('espacio_id', spaceId).single(),
    ]);

    try {
      await emailService.sendBudgetInvitation(
        normalizedEmail,
        user?.nombre || 'Alguien',
        space?.nombre || 'un espacio',
        data.token,
      );
    } catch (emailError) {
      await supabase.from('espacio_invitaciones').delete().eq('invitacion_id', Number(data.invitacion_id));
      console.error(`Email fallido para ${normalizedEmail}:`, emailError);
      throw new BadRequestError('EMAIL_ERROR', 'No se pudo enviar el correo de invitación.');
    }

    return data;
  }

  async listMembers(userId: number, spaceId: number) {
    await this.assertMember(userId, spaceId);
    const { data, error } = await supabase
      .from('espacio_miembros')
      .select('usuario_id, rol, unido_en, usuarios(usuario_id, nombre, email)')
      .eq('espacio_id', spaceId)
      .order('unido_en', { ascending: true });

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar los miembros.');

    return (data ?? []).map((row: any) => {
      const user = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
      return {
        usuario_id: Number(row.usuario_id),
        rol: row.rol,
        unido_en: row.unido_en,
        nombre: user?.nombre ?? null,
        email: user?.email ?? null,
      };
    });
  }

  async updateMemberRole(userId: number, spaceId: number, targetUserId: number, rol: string) {
    await this.assertAdmin(userId, spaceId);
    if (!['admin', 'miembro'].includes(rol)) {
      throw new BadRequestError('VALIDACION_ERROR', 'Rol inválido.');
    }

    const { data: member, error: memberError } = await supabase
      .from('espacio_miembros')
      .select('usuario_id, rol')
      .eq('espacio_id', spaceId)
      .eq('usuario_id', targetUserId)
      .maybeSingle();

    if (memberError) throw new BadRequestError('DB_ERROR', 'No se pudo validar miembro.');
    if (!member) throw new NotFoundError('NOT_FOUND', 'Miembro no encontrado.');

    if (member.rol === 'admin' && rol === 'miembro') {
      const adminCount = await this.countAdmins(spaceId);
      if (adminCount <= 1) {
        throw new BadRequestError('VALIDACION_ERROR', 'Debe existir al menos un admin en el espacio.');
      }
    }

    const { error } = await supabase
      .from('espacio_miembros')
      .update({ rol })
      .eq('espacio_id', spaceId)
      .eq('usuario_id', targetUserId);
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo actualizar el rol.');
  }

  async removeMember(userId: number, spaceId: number, targetUserId: number) {
    await this.assertAdmin(userId, spaceId);

    const { data: member, error: memberError } = await supabase
      .from('espacio_miembros')
      .select('usuario_id, rol')
      .eq('espacio_id', spaceId)
      .eq('usuario_id', targetUserId)
      .maybeSingle();
    if (memberError) throw new BadRequestError('DB_ERROR', 'No se pudo validar miembro.');
    if (!member) throw new NotFoundError('NOT_FOUND', 'Miembro no encontrado.');

    if (member.rol === 'admin') {
      const adminCount = await this.countAdmins(spaceId);
      if (adminCount <= 1) {
        throw new BadRequestError('VALIDACION_ERROR', 'Debe existir al menos un admin en el espacio.');
      }
    }

    const { error } = await supabase
      .from('espacio_miembros')
      .delete()
      .eq('espacio_id', spaceId)
      .eq('usuario_id', targetUserId);
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo remover el miembro.');
  }

  async listInvitations(userId: number, spaceId: number) {
    await this.assertAdmin(userId, spaceId);
    const { data, error } = await supabase
      .from('espacio_invitaciones')
      .select('invitacion_id, email_invitado, estado, token, expira_en, creado_en, invitado_por')
      .eq('espacio_id', spaceId)
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: false });

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar invitaciones.');
    return data ?? [];
  }

  async cancelInvitation(userId: number, spaceId: number, invitationId: number) {
    await this.assertAdmin(userId, spaceId);
    const { error } = await supabase
      .from('espacio_invitaciones')
      .update({ estado: 'rechazada' })
      .eq('espacio_id', spaceId)
      .eq('invitacion_id', invitationId)
      .eq('estado', 'pendiente');

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo cancelar invitación.');
  }

  async acceptInvitation(token: string, email: string) {
    const normalizedEmail = email?.toLowerCase().trim();
    if (!normalizedEmail) throw new BadRequestError('VALIDACION_ERROR', 'El email es requerido.');

    const { data: invitation, error } = await supabase
      .from('espacio_invitaciones')
      .select('invitacion_id, espacio_id, email_invitado, estado, expira_en')
      .eq('token', token)
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar la invitación.');
    if (!invitation) throw new NotFoundError('NOT_FOUND', 'Invitación no encontrada.');
    if (invitation.estado !== 'pendiente') {
      throw new BadRequestError('VALIDACION_ERROR', 'La invitación no está pendiente.');
    }
    if (new Date(invitation.expira_en).getTime() < Date.now()) {
      await supabase
        .from('espacio_invitaciones')
        .update({ estado: 'expirada' })
        .eq('invitacion_id', invitation.invitacion_id);
      throw new BadRequestError('VALIDACION_ERROR', 'La invitación ha expirado.');
    }
    if (String(invitation.email_invitado).toLowerCase() !== normalizedEmail) {
      throw new UnauthorizedError('FORBIDDEN', 'Este email no corresponde a la invitación.');
    }

    const { data: user, error: userError } = await supabase
      .from('usuarios')
      .select('usuario_id')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (userError) throw new BadRequestError('DB_ERROR', 'No se pudo validar usuario.');
    if (!user) {
      throw new NotFoundError('NOT_FOUND', 'No existe una cuenta para este email.');
    }

    const { data: existingMember, error: existingMemberError } = await supabase
      .from('espacio_miembros')
      .select('usuario_id')
      .eq('espacio_id', invitation.espacio_id)
      .eq('usuario_id', user.usuario_id)
      .maybeSingle();
    if (existingMemberError) throw new BadRequestError('DB_ERROR', 'No se pudo validar membresía.');

    if (!existingMember) {
      const { error: insertError } = await supabase.from('espacio_miembros').insert({
        espacio_id: invitation.espacio_id,
        usuario_id: user.usuario_id,
        rol: 'miembro',
      });
      if (insertError) throw new BadRequestError('DB_ERROR', 'No se pudo aceptar invitación.');
    }

    const { error: updateError } = await supabase
      .from('espacio_invitaciones')
      .update({ estado: 'aceptada' })
      .eq('invitacion_id', invitation.invitacion_id);
    if (updateError) throw new BadRequestError('DB_ERROR', 'No se pudo actualizar la invitación.');

    return {
      invitacion_id: Number(invitation.invitacion_id),
      espacio_id: Number(invitation.espacio_id),
      usuario_id: Number(user.usuario_id),
      estado: 'aceptada',
    };
  }

  private async assertMember(userId: number, spaceId: number) {
    const { data, error } = await supabase
      .from('espacio_miembros')
      .select('usuario_id')
      .eq('espacio_id', spaceId)
      .eq('usuario_id', userId)
      .maybeSingle();
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar membresía.');
    if (!data) throw new UnauthorizedError('FORBIDDEN', 'No pertenece a este espacio.');
  }

  private async assertAdmin(userId: number, spaceId: number) {
    const { data, error } = await supabase
      .from('espacio_miembros')
      .select('rol')
      .eq('espacio_id', spaceId)
      .eq('usuario_id', userId)
      .maybeSingle();
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar permisos.');
    if (!data || data.rol !== 'admin') {
      throw new UnauthorizedError('FORBIDDEN', 'Se requieren permisos de admin.');
    }
  }

  private async countAdmins(spaceId: number): Promise<number> {
    const { count, error } = await supabase
      .from('espacio_miembros')
      .select('usuario_id', { count: 'exact', head: true })
      .eq('espacio_id', spaceId)
      .eq('rol', 'admin');
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo validar admins del espacio.');
    return count ?? 0;
  }
}

