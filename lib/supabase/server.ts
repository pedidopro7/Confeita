import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const SUPABASE_URL = 'https://sknzdhnjmmgqwfmiedkv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3ydtCf1je_URlXCYx5HIug_9ZhrxtRT';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always write cookies; middleware will refresh sessions later.
        }
      }
    }
  });
}
