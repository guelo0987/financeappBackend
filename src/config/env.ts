import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url('SUPABASE_URL es requerido y debe ser una URL válida'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY es requerido'),
  BACKEND_PUBLIC_URL: z.string().url('BACKEND_PUBLIC_URL debe ser una URL válida').optional(),
  FRONTEND_PUBLIC_URL: z.string().url('FRONTEND_PUBLIC_URL debe ser una URL válida').optional(),
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
