import Link from 'next/link';
import { Copy, ShieldCheck, UserCog, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { shortDateTime } from '@/lib/format';
import { inviteMemberRc1Action, revokeInvitationAction, updateMemberAccessAction } from './actions';

const roleLabels: Record<string,string> = { owner:'Proprietário', manager:'Gestor', service:'Atendimento', production:'Produção', stock:'Estoque', finance:'Financeiro' };
const permissions = [
  ['view_costs','Ver custos'], ['view_revenue','Ver faturamento'], ['access_cofre','Acessar Cofre'], ['edit_recipes','Alterar receitas'],
  ['adjust_stock','Ajustar estoque'], ['cancel_orders','Cancelar pedidos'], ['apply_discount','Aplicar desconto'], ['view_customers','Ver clientes']
] as const;

export default async function EquipePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireOwner();
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : null;
  const ok = typeof params.ok === 'string' ? params.ok : null;
  const error = typeof params.erro === 'string' ? params.erro : null;
  const supabase = await createClient();
  const [membersResult, invitesResult] = await Promise.all([
    supabase.from('business_members').select('id,user_id,role,status,permissions,created_at').eq('business_id', context.business.id).order('created_at'),
    supabase.from('business_invitations').select('id,email,role,status,permissions,expires_at,created_at').eq('business_id', context.business.id).order('created_at', { ascending: false })
  ]);
  const members = membersResult.data ?? [];
  const invites = invitesResult.data ?? [];
  const invitePath = token ? `/convite/${token}` : null;

  return <>
    <PageHeader eyebrow="Acessos" title="Equipe" description="Funções e permissões separadas. Produção não precisa enxergar financeiro e o Cofre continua protegido." />
    {(ok || error) && <div className={`mb-5 rounded-2xl px-4 py-3 text-xs font-bold ${error ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>{error || (ok === 'convite' ? 'Convite criado.' : ok === 'acesso' ? 'Acesso atualizado.' : 'Alteração concluída.')}</div>}

    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <div className="space-y-5">
        <section className="panel overflow-hidden">
          <div className="flex items-center gap-3 border-b border-wine/10 px-5 py-4"><UserCog size={16} className="text-wine"/><div><p className="m-0 text-sm font-black text-wine">Membros</p><p className="m-0 mt-1 text-[10px] text-graphite/40">{members.length} acessos cadastrados</p></div></div>
          <div className="divide-y divide-wine/5">{members.map((member) => {
            const fixedOwner = member.role === 'owner';
            const memberPermissions = (member.permissions ?? {}) as Record<string,boolean>;
            return <div key={member.id} className="p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="m-0 text-sm font-black text-graphite">{roleLabels[member.role] ?? member.role}</p><p className="m-0 mt-1 text-[10px] text-graphite/35">ID {member.user_id.slice(0,8)}… · desde {shortDateTime(member.created_at)}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase ${member.status === 'active' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{member.status === 'active' ? 'ativo' : 'suspenso'}</span></div>
              {fixedOwner ? <div className="mt-4 flex items-center gap-2 rounded-2xl bg-wine/[.04] px-3 py-2.5 text-[10px] font-bold text-wine"><ShieldCheck size={13}/>Acesso total e permanente do proprietário.</div> : <form action={updateMemberAccessAction.bind(null, member.id)} className="mt-4 rounded-2xl bg-cream/55 p-4"><div className="grid gap-2 sm:grid-cols-2"><select name="role" defaultValue={member.role} className="input"><option value="manager">Gestor</option><option value="service">Atendimento</option><option value="production">Produção</option><option value="stock">Estoque</option><option value="finance">Financeiro</option></select><select name="status" defaultValue={member.status} className="input"><option value="active">Ativo</option><option value="suspended">Suspenso</option></select></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{permissions.map(([key,label]) => <label key={key} className="flex items-center gap-2 text-[10px] font-bold text-graphite/55"><input type="checkbox" name={key} defaultChecked={Boolean(memberPermissions[key])}/>{label}</label>)}</div><button className="mt-4 h-9 w-full rounded-2xl bg-white text-[10px] font-bold text-wine">Salvar acesso</button></form>}
            </div>;
          })}</div>
        </section>

        <section className="panel overflow-hidden"><div className="border-b border-wine/10 px-5 py-4"><p className="m-0 text-sm font-black text-wine">Convites</p></div>{invites.length === 0 ? <div className="p-6 text-center text-xs text-graphite/40">Nenhum convite.</div> : <div className="divide-y divide-wine/5">{invites.map((invite) => <div key={invite.id} className="flex items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="m-0 truncate text-sm font-bold text-graphite">{invite.email}</p><p className="m-0 mt-1 text-xs text-graphite/35">{roleLabels[invite.role] ?? invite.role} · expira {shortDateTime(invite.expires_at)}</p></div><span className="text-[10px] font-bold text-wine">{invite.status}</span>{invite.status === 'pending' && <form action={revokeInvitationAction.bind(null, invite.id)}><button className="mini-button text-danger" title="Revogar">×</button></form>}</div>)}</div>}</section>
      </div>

      <aside className="space-y-5">
        <form action={inviteMemberRc1Action} className="panel p-5"><div className="flex items-center gap-2"><UserPlus size={15} className="text-wine"/><p className="eyebrow m-0">Novo acesso</p></div><h2 className="mt-2 text-xl font-black text-wine">Convidar pessoa</h2><div className="space-y-3"><input required type="email" name="email" placeholder="email@exemplo.com" className="input" /><select name="role" className="input"><option value="manager">Gestor</option><option value="service">Atendimento</option><option value="production">Produção</option><option value="stock">Estoque</option><option value="finance">Financeiro</option></select></div><p className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-wider text-graphite/35">Permissões extras</p><div className="grid gap-2">{permissions.map(([key,label]) => <label key={key} className="flex items-center gap-2 rounded-xl bg-cream/55 px-3 py-2 text-[10px] font-bold text-graphite/55"><input type="checkbox" name={key}/>{label}</label>)}</div><button className="mt-4 h-11 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Gerar convite seguro</button></form>
        {invitePath && <div className="rounded-3xl bg-success/10 p-5"><p className="m-0 text-xs font-black text-success">Convite pronto</p><p className="mt-2 text-[10px] leading-5 text-graphite/55">Envie este link para a pessoa convidada. Ele só funciona para o e-mail informado e expira automaticamente.</p><div className="mt-3 rounded-2xl bg-white p-3"><p className="m-0 break-all text-[10px] font-bold text-wine">{invitePath}</p></div><Link href={invitePath} className="mt-3 flex h-10 items-center justify-center gap-2 rounded-2xl bg-success text-xs font-bold text-white"><Copy size={13}/> Abrir convite</Link></div>}
      </aside>
    </div>
  </>;
}
