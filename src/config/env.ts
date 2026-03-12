import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET es requerido'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY es requerido'),
  EMAIL_FROM: z.string().email('EMAIL_FROM debe ser un email válido'),
  APP_URL: z.string().url().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Variables de entorno inválidas: ${issues}`);
}

export const env = parsed.data;

