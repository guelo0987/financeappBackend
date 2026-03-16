import express from 'express';
import helmet from 'helmet';
import alertsRoutes from './routes/alerts.routes';
import webhooksRoutes from './routes/webhooks.routes';
import authRoutes from './routes/auth.routes';
import budgetsRoutes from './routes/budgets.routes';
import categoriesRoutes from './routes/categories.routes';
import dashboardRoutes from './routes/dashboard.routes';
import insightsRoutes from './routes/insights.routes';
import invitationsRoutes from './routes/invitations.routes';
import recurringRoutes from './routes/recurring.routes';
import subscriptionsRoutes from './routes/subscriptions.routes';
import transactionsRoutes from './routes/transactions.routes';
import walletsRoutes from './routes/wallets.routes';
import cronRoutes from './routes/cron.routes';
import { errorHandler } from './middleware/error.middleware';
import { globalLimiter, authLimiter, emailLimiter } from './middleware/rate-limit.middleware';
import { getSupabaseClient } from './config/supabase';

const app = express();

// Trust first proxy (Vercel, Cloudflare, etc.)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

// Mobile API — allow all origins (iOS app doesn't send Origin header)
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (_req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});

// Webhooks need raw body before JSON parsing for signature verification
app.use('/webhooks', express.raw({ type: 'application/json', limit: '100kb' }));
app.use('/webhooks', webhooksRoutes);

app.use(express.json({ limit: '100kb' }));
app.use(globalLimiter);

app.get('/health', async (_req, res) => {
  try {
    const supabase: any = getSupabaseClient();
    const { error } = await supabase.from('usuarios').select('usuario_id').limit(1);
    if (error) throw error;
    res.json({ data: { status: 'ok', db: 'connected' } });
  } catch {
    res.status(503).json({ data: { status: 'degraded', db: 'unreachable' } });
  }
});

// Auth routes with stricter rate limit
app.use('/auth', authLimiter, authRoutes);

app.use('/alerts', alertsRoutes);
app.use('/budgets', budgetsRoutes);
app.use('/categories', categoriesRoutes);
app.use('/cron', cronRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/insights', insightsRoutes);
app.use('/invitations', emailLimiter, invitationsRoutes);
app.use('/recurring', recurringRoutes);
app.use('/subscriptions', subscriptionsRoutes);
app.use('/wallets', walletsRoutes);
app.use('/transactions', transactionsRoutes);

app.use(errorHandler);

export { app };
