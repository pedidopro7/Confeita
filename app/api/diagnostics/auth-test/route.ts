import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin-test@example.invalid',
    password: 'admin'
  });

  if (error) {
    return NextResponse.json({ ok: false, name: error.name, message: error.message, status: error.status, code: error.code ?? null });
  }

  return NextResponse.json({ ok: true, userId: data.user?.id ?? null, email: data.user?.email ?? null });
}
