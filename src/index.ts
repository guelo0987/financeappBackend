import { app } from './app';
import { env } from './config/env';

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

// Vercel uses the exported app directly; local dev uses app.listen() + node-cron
if (env.NODE_ENV !== 'production') {
  const { startRecurringJob } = require('./jobs/recurring.job');
  const { startHistoryJob } = require('./jobs/history.job');

  app.listen(env.PORT, () => {
    console.log(`Server started on port ${env.PORT} (${env.NODE_ENV})`);
    startRecurringJob();
    startHistoryJob();
  });
}

export default app;
