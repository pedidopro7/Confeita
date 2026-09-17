import { NextResponse } from 'next/server';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

  let host = '';
  let projectRef = '';
  try {
    const parsed = new URL(url);
    host = parsed.host;
    projectRef = parsed.hostname.split('.')[0] ?? '';
  } catch {}

  return NextResponse.json({
    configured: Boolean(url && key),
    host,
    projectRef,
    keyType: key.startsWith('sb_publishable_') ? 'publishable' : key ? 'other' : 'missing'
  });
}
