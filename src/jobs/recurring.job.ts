import cron from 'node-cron';
import { RecurringService } from '../services/recurring.service';

const recurringService = new RecurringService();

/**
 * Runs every day at 06:00 AM server time.
 * Processes all active recurring transactions that are due today or overdue.
 */
export function startRecurringJob(): void {
  cron.schedule('0 6 * * *', async () => {
    const started = new Date().toISOString();
    console.log(`[recurring-job] Iniciando procesamiento de recurrentes — ${started}`);
    try {
      const result = await recurringService.processDueTransactions();
      console.log(`[recurring-job] Completado — procesadas: ${result.processed}, errores: ${result.errors}`);
    } catch (err) {
      console.error('[recurring-job] Error inesperado:', err);
    }
  });

  console.log('[recurring-job] Cron registrado — se ejecuta cada día a las 6:00 AM');
}
