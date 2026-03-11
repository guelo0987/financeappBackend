import express from 'express';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
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

const app = express();
const openapiPath = path.resolve(process.cwd(), 'docs/openapi.yaml');
const openapiDocument = YAML.load(openapiPath);

app.use(corsMiddleware);
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

app.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok' } });
});

app.use('/auth', authRoutes);
app.use('/budgets', budgetsRoutes);
app.use('/categories', categoriesRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/insights', insightsRoutes);
app.use('/invitations', invitationsRoutes);
app.use('/recurring', recurringRoutes);
app.use('/wallets', walletsRoutes);
app.use('/transactions', transactionsRoutes);

app.use(errorHandler);

export { app };
