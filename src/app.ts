import express from 'express';
import helmet from 'helmet';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import alertsRoutes from './routes/alerts.routes';
import webhooksRoutes from './routes/webhooks.routes';
import authRoutes from './routes/auth.routes';
import budgetsRoutes from './routes/budgets.routes';
import categoriesRoutes from './routes/categories.routes';
import dashboardRoutes from './routes/dashboard.routes';
import insightsRoutes from './routes/insights.routes';
import invitationsRoutes from './routes/invitations.routes';
import recurringRoutes from './routes/recurring.routes';
import transactionsRoutes from './routes/transactions.routes';
import walletsRoutes from './routes/wallets.routes';
import { corsMiddleware } from './middleware/cors.middleware';
import { errorHandler } from './middleware/error.middleware';
import { globalLimiter, authLimiter, emailLimiter } from './middleware/rate-limit.middleware';
import { getSupabaseClient } from './config/supabase';

const app = express();
const openapiPath = path.resolve(process.cwd(), 'docs/openapi.yaml');
const openapiDocument = YAML.load(openapiPath);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // needed for invitation page inline script
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

app.use(corsMiddleware);

// Webhooks need raw body before JSON parsing for signature verification
app.use('/webhooks', express.raw({ type: 'application/json', limit: '100kb' }));
app.use('/webhooks', webhooksRoutes);

app.use(express.json({ limit: '100kb' }));
app.use(globalLimiter);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

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
app.use('/dashboard', dashboardRoutes);
app.use('/insights', insightsRoutes);
app.use('/invitations', emailLimiter, invitationsRoutes);
app.use('/recurring', recurringRoutes);
app.use('/wallets', walletsRoutes);
app.use('/transactions', transactionsRoutes);

app.use(errorHandler);

export { app };
