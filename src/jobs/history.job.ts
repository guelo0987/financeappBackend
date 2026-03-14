import cron from 'node-cron';
import { HistoryService } from '../services/history.service';

const historyService = new HistoryService();

/**
 * Runs every day at 06:30 AM server time (30 min after recurring job).
 * For each budget, computes the most recently closed period and creates
 * a snapshot if one doesn't already exist.
 */
export function startHistoryJob(): void {
  cron.schedule('30 6 * * *', async () => {
    const started = new Date().toISOString();
    console.log(`[history-job] Iniciando snapshots de historial — ${started}`);
    try {
      const result = await historyService.processAllBudgets();
      console.log(
        `[history-job] Completado — nuevos snapshots: ${result.processed}, errores: ${result.errors}`,
      );
    } catch (err) {
      console.error('[history-job] Error inesperado:', err);
    }
  });

  console.log('[history-job] Cron registrado — se ejecuta cada día a las 6:30 AM');
}
