import { app } from './app';
import { env } from './config/env';
import { startRecurringJob } from './jobs/recurring.job';

// BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

const log = {
  info: (msg: string, meta?: object) =>
    console.log(JSON.stringify({ level: 'info', msg, ...meta, ts: new Date().toISOString() })),
  error: (msg: string, meta?: object) =>
    console.error(JSON.stringify({ level: 'error', msg, ...meta, ts: new Date().toISOString() })),
};

const server = app.listen(env.PORT, () => {
  log.info('Server started', { port: env.PORT, env: env.NODE_ENV });
  startRecurringJob();
});

function shutdown(signal: string) {
  log.info('Shutting down gracefully', { signal });
  server.close((err) => {
    if (err) {
      log.error('Error during shutdown', { error: String(err) });
      process.exit(1);
    }
    log.info('Server closed');
    process.exit(0);
  });

  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    log.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', { error: String(err) });
  process.exit(1);
});
