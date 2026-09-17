import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type BusinessContext = {
  user: {
    id: string;
    email?: string;
    fullName?: string | null;
  };
  business: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string | null;
    whatsapp?: string | null;
    instagram?: string | null;
    city?: string | null;
    settings?: Record<string, unknown>;
  };
  role: string;
};

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect('/login');
  return { supabase, user };
}

export async function getBusinessContext(options?: { allowMissingBusiness?: boolean }): Promise<BusinessContext | null> {
  const { supabase, user } = await requireUser();

  const { data: membership } = await supabase
    .from('business_members')
    .select('role, business:businesses(id,name,slug,logo_url,whatsapp,instagram,city,settings)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!membership?.business) {
    if (options?.allowMissingBusiness) return null;
    redirect('/onboarding');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const businessRaw = membership.business as unknown;
  const business = (Array.isArray(businessRaw) ? businessRaw[0] : businessRaw) as BusinessContext['business'];

  if (!business?.id) {
    if (options?.allowMissingBusiness) return null;
    redirect('/onboarding');
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: profile?.full_name ?? user.user_metadata?.full_name ?? null
    },
    business,
    role: membership.role
  };
}

export async function requireOwner() {
  const context = await getBusinessContext();
  if (!context || context.role !== 'owner') redirect('/painel');
  return context;
}
