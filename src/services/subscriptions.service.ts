import { getSupabaseClient } from '../config/supabase';
import { BadRequestError } from '../utils/errors';

const supabase: any = getSupabaseClient();

const PLAN_MAP: Record<string, string> = {
  monthly: 'mensual',
  yearly: 'anual',
  lifetime: 'lifetime',
};

const PRICE_MAP: Record<string, number> = {
  mensual: 7.99,
  anual: 53.99,
  lifetime: 89.99,
};

function planFromProductId(productId: string): string {
  return PLAN_MAP[productId] ?? 'mensual';
}

// ─── Subscription states ────────────────────────────────────────────────
//
//   prueba     → trial activo (usuario pasó por paywall, tiene info de pago)
//                acceso SI trial_fin > ahora
//   activa     → trial terminó, cobro exitoso ó compra directa
//                acceso SI periodo_fin > ahora (null = lifetime)
//   cancelada  → usuario canceló, acceso hasta fin del periodo actual
//                acceso SI trial_fin > ahora OR periodo_fin > ahora
//   vencida    → expiró ó error de pago — SIN acceso
//
// ─────────────────────────────────────────────────────────────────────────

export class SubscriptionsService {
  async handleWebhookEvent(event: any): Promise<void> {
    const type: string = event.type;
    const appUserId: string = event.app_user_id ?? event.original_app_user_id;
    const userId = parseInt(appUserId, 10);

    if (!userId || isNaN(userId)) {
      console.warn('[webhook] app_user_id no es un entero válido:', appUserId);
      return;
    }

    console.log(`[webhook] Procesando ${type} para usuario ${userId}`);

    switch (type) {
      case 'INITIAL_PURCHASE':
        await this.handleInitialPurchase(userId, event);
        break;
      case 'NON_RENEWING_PURCHASE':
        await this.handleLifetimePurchase(userId, event);
        break;
      case 'RENEWAL':
        await this.handleRenewal(userId, event);
        break;
      case 'CANCELLATION':
        await this.handleCancellation(userId);
        break;
      case 'UNCANCELLATION':
        await this.handleUncancellation(userId);
        break;
      case 'EXPIRATION':
        await this.handleExpiration(userId);
        break;
      case 'BILLING_ISSUE':
        await this.handleBillingIssue(userId);
        break;
      case 'PRODUCT_CHANGE':
        await this.handleProductChange(userId, event);
        break;
      default:
        console.log(`[webhook] Evento no manejado: ${type}`);
    }
  }

  // ── INITIAL_PURCHASE: trial start or direct purchase ───────────────────

  private async handleInitialPurchase(userId: number, event: any): Promise<void> {
    const plan = planFromProductId(event.product_id ?? '');
    const periodType = (event.period_type ?? '').toUpperCase();
    const rcId = event.original_app_user_id ?? String(userId);

    // Detect trial: RC may send period_type='TRIAL', OR if the user is
    // currently in 'prueba' (just registered), this is their trial start.
    const { data: current } = await supabase
      .from('suscripciones')
      .select('estado')
      .eq('usuario_id', userId)
      .maybeSingle();

    const isTrial = periodType === 'TRIAL' || current?.estado === 'prueba';

    console.log(`[webhook] INITIAL_PURCHASE: period_type=${event.period_type}, db_estado=${current?.estado}, isTrial=${isTrial}`);

    if (isTrial) {
      // Trial: keep estado='prueba', sync trial_fin from RC
      const { error } = await supabase
        .from('suscripciones')
        .update({
          plan,
          revenuecat_id: rcId,
          trial_fin: event.expiration_at_ms
            ? new Date(event.expiration_at_ms).toISOString()
            : null,
          cancelado_en: null,
          actualizado_en: new Date().toISOString(),
        })
        .eq('usuario_id', userId);

      if (error) console.error('[webhook] Error en trial start:', error);
    } else {
      // Direct purchase (no trial): estado → 'activa'
      const { error } = await supabase
        .from('suscripciones')
        .update({
          estado: 'activa',
          plan,
          precio_usd: PRICE_MAP[plan] ?? null,
          revenuecat_id: rcId,
          periodo_inicio: new Date(event.purchased_at_ms ?? Date.now()).toISOString(),
          periodo_fin: event.expiration_at_ms
            ? new Date(event.expiration_at_ms).toISOString()
            : null,
          cancelado_en: null,
          actualizado_en: new Date().toISOString(),
        })
        .eq('usuario_id', userId);

      if (error) console.error('[webhook] Error en compra directa:', error);
    }
  }

  // ── NON_RENEWING_PURCHASE: lifetime ────────────────────────────────────

  private async handleLifetimePurchase(userId: number, event: any): Promise<void> {
    const { error } = await supabase
      .from('suscripciones')
      .update({
        estado: 'activa',
        plan: 'lifetime',
        precio_usd: PRICE_MAP['lifetime'],
        revenuecat_id: event.original_app_user_id ?? String(userId),
        periodo_inicio: new Date(event.purchased_at_ms ?? Date.now()).toISOString(),
        periodo_fin: null, // lifetime = sin expiración
        cancelado_en: null,
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);

    if (error) console.error('[webhook] Error en compra lifetime:', error);
  }

  // ── RENEWAL: trial convertido a pago ó renovación ──────────────────────

  private async handleRenewal(userId: number, event: any): Promise<void> {
    const plan = planFromProductId(event.product_id ?? '');
    const { error } = await supabase
      .from('suscripciones')
      .update({
        estado: 'activa',
        plan,
        precio_usd: PRICE_MAP[plan] ?? null,
        periodo_inicio: new Date().toISOString(),
        periodo_fin: event.expiration_at_ms
          ? new Date(event.expiration_at_ms).toISOString()
          : null,
        cancelado_en: null,
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);

    if (error) console.error('[webhook] Error en renovación:', error);
  }

  // ── CANCELLATION: acceso hasta fin del periodo actual ──────────────────

  private async handleCancellation(userId: number): Promise<void> {
    const { error } = await supabase
      .from('suscripciones')
      .update({
        estado: 'cancelada',
        cancelado_en: new Date().toISOString(),
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);

    if (error) console.error('[webhook] Error en cancelación:', error);
  }

  // ── UNCANCELLATION: usuario reactivó ───────────────────────────────────

  private async handleUncancellation(userId: number): Promise<void> {
    // Determine whether user is still in trial or has an active subscription
    const { data: current } = await supabase
      .from('suscripciones')
      .select('plan, periodo_fin, trial_fin')
      .eq('usuario_id', userId)
      .maybeSingle();

    const inTrial = current && !current.periodo_fin && current.plan !== 'lifetime';
    const newEstado = inTrial ? 'prueba' : 'activa';

    const { error } = await supabase
      .from('suscripciones')
      .update({
        estado: newEstado,
        cancelado_en: null,
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);

    if (error) console.error('[webhook] Error en reactivación:', error);
  }

  // ── EXPIRATION: sin renovación ─────────────────────────────────────────

  private async handleExpiration(userId: number): Promise<void> {
    const { error } = await supabase
      .from('suscripciones')
      .update({
        estado: 'vencida',
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);

    if (error) console.error('[webhook] Error en expiración:', error);
  }

  // ── BILLING_ISSUE: error de pago → sin acceso ─────────────────────────

  private async handleBillingIssue(userId: number): Promise<void> {
    const { error: updateError } = await supabase
      .from('suscripciones')
      .update({
        estado: 'vencida',
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);

    if (updateError) console.error('[webhook] Error actualizando billing issue:', updateError);

    const { error: alertError } = await supabase.from('alertas').insert({
      usuario_id: userId,
      tipo: 'billing_issue',
      titulo: 'Problema con tu pago',
      cuerpo: 'No pudimos procesar tu pago de Menudo Pro. Actualiza tu método de pago para mantener el acceso.',
      datos_extra: {},
    });

    if (alertError) console.error('[webhook] Error creando alerta:', alertError);
  }

  // ── PRODUCT_CHANGE: cambio de plan ─────────────────────────────────────

  private async handleProductChange(userId: number, event: any): Promise<void> {
    const plan = planFromProductId(event.new_product_id ?? event.product_id ?? '');
    const { error } = await supabase
      .from('suscripciones')
      .update({
        plan,
        precio_usd: PRICE_MAP[plan] ?? null,
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);

    if (error) console.error('[webhook] Error en cambio de plan:', error);
  }

  // ── GET ESTADO: regla de acceso centralizada ───────────────────────────

  async getEstado(userId: number): Promise<{
    estado: string;
    plan: string;
    isActive: boolean;
    trial_fin: string | null;
    periodo_fin: string | null;
    cancelado_en: string | null;
  }> {
    const { data } = await supabase
      .from('suscripciones')
      .select('estado, plan, trial_fin, periodo_fin, cancelado_en')
      .eq('usuario_id', userId)
      .maybeSingle();

    const empty = { estado: 'vencida', plan: 'mensual', isActive: false, trial_fin: null, periodo_fin: null, cancelado_en: null };
    if (!data) return empty;

    const now = new Date();

    // prueba: acceso mientras trial_fin > ahora
    const trialActive = data.estado === 'prueba'
      && data.trial_fin != null
      && new Date(data.trial_fin) > now;

    // activa: acceso mientras periodo_fin > ahora (null = lifetime)
    const subActive = data.estado === 'activa'
      && (data.periodo_fin == null || new Date(data.periodo_fin) > now);

    // cancelada: acceso hasta fin del periodo actual
    const cancelledActive = data.estado === 'cancelada' && (
      (data.trial_fin != null && new Date(data.trial_fin) > now) ||
      (data.periodo_fin != null && new Date(data.periodo_fin) > now)
    );

    return {
      estado: data.estado,
      plan: data.plan ?? 'mensual',
      isActive: trialActive || subActive || cancelledActive,
      trial_fin: data.trial_fin,
      periodo_fin: data.periodo_fin,
      cancelado_en: data.cancelado_en,
    };
  }

  // ── CRON: expirar trials vencidos ──────────────────────────────────────

  async expireTrials(): Promise<{ expired: number }> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('suscripciones')
      .update({
        estado: 'vencida',
        actualizado_en: now,
      })
      .eq('estado', 'prueba')
      .lt('trial_fin', now)
      .select('suscripcion_id');

    if (error) throw new BadRequestError('DB_ERROR', 'Error al expirar trials.');
    return { expired: (data ?? []).length };
  }
}
