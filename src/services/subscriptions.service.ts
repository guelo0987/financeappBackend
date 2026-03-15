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

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function planFromProductId(productId: string): string {
  return PLAN_MAP[productId] ?? 'mensual';
}

export class SubscriptionsService {
  async handleWebhookEvent(event: any): Promise<void> {
    const type: string = event.type;
    const appUserId: string = event.app_user_id ?? event.original_app_user_id;
    const userId = parseInt(appUserId, 10);

    if (!userId || isNaN(userId)) {
      console.warn('[webhook] app_user_id no es un entero válido:', appUserId);
      return;
    }

    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'NON_RENEWING_PURCHASE':
        await this.handlePurchase(userId, event);
        break;
      case 'RENEWAL':
        await this.handleRenewal(userId, event);
        break;
      case 'CANCELLATION':
        await this.handleCancellation(userId, event);
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
        // Unhandled event type — log and ignore
        console.log(`[webhook] Evento no manejado: ${type}`);
    }
  }

  private async handlePurchase(userId: number, event: any): Promise<void> {
    const plan = planFromProductId(event.product_id ?? '');
    const isLifetime = plan === 'lifetime';
    const periodo_fin = !isLifetime && event.expiration_at_ms
      ? isoDate(event.expiration_at_ms)
      : null;

    const { error } = await supabase
      .from('suscripciones')
      .update({
        estado: 'activa',
        plan,
        precio_usd: PRICE_MAP[plan] ?? null,
        revenuecat_id: event.original_app_user_id ?? String(userId),
        periodo_inicio: isoDate(event.purchased_at_ms ?? Date.now()),
        periodo_fin,
        cancelado_en: null,
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);

  }

  private async handleRenewal(userId: number, event: any): Promise<void> {
    const periodo_fin = event.expiration_at_ms
      ? isoDate(event.expiration_at_ms)
      : null;

    await supabase
      .from('suscripciones')
      .update({
        estado: 'activa',
        cancelado_en: null,
        periodo_fin,
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);
  }

  private async handleCancellation(userId: number, event: any): Promise<void> {
    // Keep estado='activo' — access continues until periodo_fin
    await supabase
      .from('suscripciones')
      .update({
        cancelado_en: new Date().toISOString(),
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);
  }

  private async handleUncancellation(userId: number): Promise<void> {
    await supabase
      .from('suscripciones')
      .update({
        cancelado_en: null,
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);
  }

  private async handleExpiration(userId: number): Promise<void> {
    await supabase
      .from('suscripciones')
      .update({
        estado: 'vencida',
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);
  }

  private async handleProductChange(userId: number, event: any): Promise<void> {
    const plan = planFromProductId(event.new_product_id ?? event.product_id ?? '');
    await supabase
      .from('suscripciones')
      .update({
        plan,
        actualizado_en: new Date().toISOString(),
      })
      .eq('usuario_id', userId);
  }

  private async handleBillingIssue(userId: number): Promise<void> {
    const { error } = await supabase.from('alertas').insert({
      usuario_id: userId,
      tipo: 'billing_issue',
      titulo: 'Problema con tu pago',
      cuerpo: 'No pudimos procesar tu pago de Menudo Pro. Actualiza tu método de pago para mantener el acceso.',
      datos_extra: {},
    });
    if (error) console.error('[webhook] Error creando alerta billing_issue:', error);
  }

  // Cron: run daily to expire trials past their end date
  async expireTrials(): Promise<{ expired: number }> {
    const now = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('suscripciones')
      .update({
        estado: 'vencida',
        actualizado_en: new Date().toISOString(),
      })
      .eq('estado', 'prueba')
      .lt('trial_fin', now)
      .select('suscripcion_id');

    if (error) throw new BadRequestError('DB_ERROR', 'Error al expirar trials.');
    return { expired: (data ?? []).length };
  }
}
