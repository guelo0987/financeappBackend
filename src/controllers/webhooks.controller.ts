import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { SubscriptionsService } from '../services/subscriptions.service';

const subscriptionsService = new SubscriptionsService();

export async function revenueCatWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Verify authorization header — RC sends the webhook secret as Bearer token
    if (env.REVENUECAT_WEBHOOK_SECRET) {
      const auth = req.headers['authorization'] ?? '';
      const expected = `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`;
      const a = Buffer.from(auth);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    // Parse body
    const raw = req.body;
    const body = Buffer.isBuffer(raw)
      ? JSON.parse(raw.toString('utf-8'))
      : typeof raw === 'string'
        ? JSON.parse(raw)
        : raw;
    const event = body?.event;

    if (!event) {
      console.warn('[webhook/revenuecat] Payload sin evento');
      res.status(200).json({ received: true });
      return;
    }

    // Process BEFORE responding (Vercel kills function after response)
    console.log(`[webhook/revenuecat] Procesando evento: ${event.type} | user: ${event.app_user_id}`);
    await subscriptionsService.handleWebhookEvent(event);

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[webhook/revenuecat] Error:', error);
    res.status(200).json({ received: true });
  }
}
