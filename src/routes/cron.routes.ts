import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { RecurringService } from '../services/recurring.service';
import { HistoryService } from '../services/history.service';
import { SubscriptionsService } from '../services/subscriptions.service';

const router = Router();

// Vercel Cron sends Authorization: Bearer <CRON_SECRET>
function verifyCron(req: Request, res: Response): boolean {
  if (env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
  }
  return true;
}

// GET /cron/recurring — called daily at 6:00 AM by Vercel Cron
router.get('/recurring', async (req: Request, res: Response) => {
  if (!verifyCron(req, res)) return;
  try {
    const service = new RecurringService();
    const result = await service.processDueTransactions();
    res.json({ data: result });
  } catch (err) {
    console.error('[cron/recurring] Error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
});

// GET /cron/history — called daily at 6:30 AM by Vercel Cron
router.get('/history', async (req: Request, res: Response) => {
  if (!verifyCron(req, res)) return;
  try {
    const historyService = new HistoryService();
    const subscriptionsService = new SubscriptionsService();

    const snapshots = await historyService.processAllBudgets();
    const trials = await subscriptionsService.expireTrials();

    res.json({
      data: {
        snapshots: { processed: snapshots.processed, errors: snapshots.errors },
        trials: { expired: trials.expired },
      },
    });
  } catch (err) {
    console.error('[cron/history] Error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
});

export default router;
