import { createClient } from '@supabase/supabase-js';
import { env } from './env';

let singleton: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos para inicializar Supabase.',
    );
  }

  if (!singleton) {
    singleton = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return singleton;
}

