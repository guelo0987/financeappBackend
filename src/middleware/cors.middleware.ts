import cors from 'cors';
import { env } from '../config/env';

// For a mobile app, Origin header is not sent, so CORS mostly affects web clients.
// Allow APP_URL (e.g. docs/admin) plus the docs path. In production, tighten this list.
const allowedOrigins = new Set([
  env.APP_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
]);

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
});
