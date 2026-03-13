import { getSupabaseClient } from '../config/supabase';
import { BadRequestError, NotFoundError } from '../utils/errors';

const supabase: any = getSupabaseClient();

const ALERT_SELECT =
  'alerta_id, tipo, titulo, cuerpo, datos_extra, fue_leida, fue_enviada, espacio_id, creado_en';

export class AlertsService {
  async getAll(userId: number, soloNoLeidas?: boolean, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(100, limit));
    const from = (safePage - 1) * safeLimit;
    const to = from + safeLimit - 1;

    let query = supabase
      .from('alertas')
      .select(ALERT_SELECT, { count: 'exact' })
      .eq('usuario_id', userId)
      .order('creado_en', { ascending: false })
      .range(from, to);

    if (soloNoLeidas) {
      query = query.eq('fue_leida', false);
    }

    const { data, error, count } = await query;
    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron cargar las alertas.');

    const total = count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

    return {
      data: (data ?? []).map(this.mapAlert),
      meta: { page: safePage, limit: safeLimit, total, totalPages, hasMore: safePage < totalPages },
    };
  }

  async markAsRead(userId: number, alertId: number) {
    const { data, error } = await supabase
      .from('alertas')
      .update({ fue_leida: true })
      .eq('alerta_id', alertId)
      .eq('usuario_id', userId)
      .select(ALERT_SELECT)
      .maybeSingle();

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo marcar la alerta como leída.');
    if (!data) throw new NotFoundError('NOT_FOUND', 'Alerta no encontrada.');

    return this.mapAlert(data);
  }

  async markAllAsRead(userId: number) {
    const { error } = await supabase
      .from('alertas')
      .update({ fue_leida: true })
      .eq('usuario_id', userId)
      .eq('fue_leida', false);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudieron marcar las alertas como leídas.');
  }

  async getUnreadCount(userId: number): Promise<number> {
    const { count, error } = await supabase
      .from('alertas')
      .select('alerta_id', { count: 'exact', head: true })
      .eq('usuario_id', userId)
      .eq('fue_leida', false);

    if (error) throw new BadRequestError('DB_ERROR', 'No se pudo obtener el conteo de alertas.');
    return count ?? 0;
  }

  private mapAlert(row: any) {
    return {
      id: Number(row.alerta_id),
      tipo: row.tipo,
      titulo: row.titulo,
      cuerpo: row.cuerpo,
      datos_extra: row.datos_extra ?? {},
      fue_leida: row.fue_leida,
      espacio_id: row.espacio_id ? Number(row.espacio_id) : null,
      creado_en: row.creado_en,
    };
  }
}
