import { createClient } from '@supabase/supabase-js';

// Supabase client factory function that takes environment variables
export function createSupabaseClient(env: any) {
  const SUPABASE_URL = env.SUPABASE_URL || '';
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase URL and Key must be provided');
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY);
}
