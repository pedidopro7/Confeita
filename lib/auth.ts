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
  permissions: Record<string, boolean>;
};

const rolePermissions: Record<string, string[]> = {
  owner: ['*'],
  manager: ['view_costs','view_revenue','adjust_stock','cancel_orders','apply_discount','view_customers','manage_products','manage_orders','manage_production','manage_purchases'],
  service: ['view_customers','manage_orders','manage_quotes'],
  production: ['manage_production'],
  stock: ['adjust_stock','manage_purchases'],
  finance: ['view_revenue','manage_finance']
};

export function hasPermission(context: Pick<BusinessContext, 'role' | 'permissions'>, permission: string) {
  if (context.role === 'owner') return true;
  if (context.permissions?.[permission] === true) return true;
  const defaults = rolePermissions[context.role] ?? [];
  return defaults.includes('*') || defaults.includes(permission);
}

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
    .select('role,permissions,business:businesses(id,name,slug,logo_url,whatsapp,instagram,city,settings)')
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
    role: membership.role,
    permissions: ((membership.permissions ?? {}) as Record<string, boolean>)
  };
}

export async function requireOwner() {
  const context = await getBusinessContext();
  if (!context || context.role !== 'owner') redirect('/painel');
  return context;
}

export async function requireBusinessAccess(permission: string) {
  const context = await getBusinessContext();
  if (!context || !hasPermission(context, permission)) redirect('/painel');
  return context;
}
