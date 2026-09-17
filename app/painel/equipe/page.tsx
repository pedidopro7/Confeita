import { PageHeader } from '@/components/page-header';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { inviteMemberAction } from '../actions';
import { shortDateTime } from '@/lib/format';

export default async function EquipePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireOwner();
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : null;
  const supabase = await createClient();
  const [membersResult, invitesResult] = await Promise.all([
    supabase.from('business_members').select('id,user_id,role,status,created_at').eq('business_id', context.business.id).order('created_at'),
    supabase.from('business_invitations').select('id,email,role,status,expires_at,created_at').eq('business_id', context.business.id).order('created_at', { ascending: false })
  ]);
  const members = membersResult.data ?? [];
  const invites = invitesResult.data ?? [];

  return <><PageHeader eyebrow="Acessos" title="Equipe" description="Controle quem trabalha na operação. Receitas completas continuam obedecendo às permissões do Cofre." />
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><div className="space-y-5">
      <section className="panel overflow-hidden"><div className="border-b border-wine/10 px-5 py-4 font-bold text-wine">Membros ativos</div>{members.map(m => <div key={m.id} className="flex items-center justify-between border-b border-wine/5 px-5 py-4 last:border-0"><div><p className="m-0 text-sm font-bold text-graphite">{m.role === 'owner' ? 'Proprietário' : m.role}</p><p className="m-0 mt-1 text-xs text-graphite/35">{m.user_id.slice(0, 8)}… · desde {shortDateTime(m.created_at)}</p></div><span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-bold text-success">{m.status}</span></div>)}</section>
      <section className="panel overflow-hidden"><div className="border-b border-wine/10 px-5 py-4 font-bold text-wine">Convites</div>{invites.length === 0 ? <div className="p-6 text-center text-xs text-graphite/40">Nenhum convite.</div> : invites.map(i => <div key={i.id} className="flex items-center justify-between border-b border-wine/5 px-5 py-4 last:border-0"><div><p className="m-0 text-sm font-bold text-graphite">{i.email}</p><p className="m-0 mt-1 text-xs text-graphite/35">{i.role} · expira {shortDateTime(i.expires_at)}</p></div><span className="text-xs font-bold text-wine">{i.status}</span></div>)}</section>
    </div><aside className="space-y-5"><form action={inviteMemberAction} className="panel p-5"><p className="eyebrow mb-1">Novo acesso</p><h2 className="mt-0 text-xl font-black text-wine">Convidar pessoa</h2><div className="space-y-3"><input required type="email" name="email" placeholder="email@exemplo.com" className="input" /><select name="role" className="input"><option value="manager">Gestor</option><option value="service">Atendimento</option><option value="production">Produção</option><option value="stock">Estoque</option><option value="finance">Financeiro</option></select></div><button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Gerar convite</button></form>{token && <div className="rounded-3xl bg-success/10 p-5"><p className="m-0 text-xs font-black text-success">Convite criado</p><p className="mt-2 break-all text-[10px] leading-5 text-graphite/60">Token temporário: {token}</p><p className="mb-0 text-[10px] text-graphite/40">O envio automático por e-mail será ligado ao provedor transacional.</p></div>}</aside></div>
  </>;
}
