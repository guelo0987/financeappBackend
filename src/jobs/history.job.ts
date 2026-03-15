import cron from 'node-cron';
import { HistoryService } from '../services/history.service';
import { SubscriptionsService } from '../services/subscriptions.service';

const historyService = new HistoryService();
const subscriptionsService = new SubscriptionsService();

/**
 * Runs every day at 06:30 AM server time (30 min after recurring job).
 * - Creates period snapshots for all budgets
 * - Expires trials past their trial_fin date
 */
export function startHistoryJob(): void {
  cron.schedule('30 6 * * *', async () => {
    const started = new Date().toISOString();
    console.log(`[history-job] Iniciando — ${started}`);

    try {
      const snapshots = await historyService.processAllBudgets();
      console.log(`[history-job] Snapshots — nuevos: ${snapshots.processed}, errores: ${snapshots.errors}`);
    } catch (err) {
      console.error('[history-job] Error en snapshots:', err);
    }

    try {
      const trials = await subscriptionsService.expireTrials();
      if (trials.expired > 0) {
        console.log(`[history-job] Trials expirados: ${trials.expired}`);
      }
    } catch (err) {
      console.error('[history-job] Error expirando trials:', err);
    }
  });

  console.log('[history-job] Cron registrado — se ejecuta cada día a las 6:30 AM');
}
