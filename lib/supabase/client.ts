import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = 'https://sknzdhnjmmgqwfmiedkv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3ydtCf1je_URlXCYx5HIug_9ZhrxtRT';

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
