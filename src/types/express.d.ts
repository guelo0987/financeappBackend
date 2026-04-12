import { User } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      supabaseUser?: User;
      userId?: number;
      supabaseAuthUserId?: string;
      userEmail?: string;
    }
  }
}

export {};
