import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  SUPABASE_URL: z.string().url('SUPABASE_URL es requerido y debe ser una URL válida'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY es requerido'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY es requerido'),
  EMAIL_FROM: z.string().email('EMAIL_FROM debe ser un email válido'),
  REVENUECAT_WEBHOOK_SECRET: z.string().min(1, 'REVENUECAT_WEBHOOK_SECRET es requerido'),
  CRON_SECRET: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Variables de entorno inválidas: ${issues}`);
}

export const env = parsed.data;

