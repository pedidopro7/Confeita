import Link from 'next/link';
import { CheckCircle2, LockKeyhole, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { acceptInvitationAction } from './actions';

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const query = await searchParams;
  const error = typeof query.erro === 'string' ? query.erro : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const next = `/convite/${token}`;

  return <main className="min-h-screen bg-cream px-4 py-8 md:grid md:place-items-center">
    <div className="mx-auto w-full max-w-xl rounded-[2rem] border border-wine/10 bg-white p-6 shadow-soft sm:p-9">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-wine text-cream"><LockKeyhole size={19}/></div><div><p className="m-0 text-xl font-black text-wine">confeita<span className="text-terracotta">.</span></p><p className="m-0 text-[9px] uppercase tracking-[.18em] text-graphite/35">convite de equipe</p></div></div>
      <div className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose/25 text-wine"><UsersRound size={24}/></div>
      <h1 className="mb-0 mt-5 text-3xl font-black tracking-[-.04em] text-wine">Você foi convidado para uma confeitaria.</h1>
      <p className="mt-3 text-sm leading-6 text-graphite/55">O acesso será criado com o perfil definido pelo proprietário. O Cofre de Receitas continua obedecendo às permissões da empresa.</p>
      {error && <div className="mt-5 rounded-2xl bg-danger/10 px-4 py-3 text-xs font-bold text-danger">{error}</div>}

      {user ? <form action={acceptInvitationAction.bind(null, token)} className="mt-7"><div className="mb-4 flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-3 text-xs font-bold text-success"><CheckCircle2 size={15}/>Conta conectada: {user.email}</div><button className="h-12 w-full rounded-2xl bg-wine text-sm font-bold text-cream">Aceitar convite e entrar</button></form> : <div className="mt-7 grid gap-3 sm:grid-cols-2"><Link href={`/login?next=${encodeURIComponent(next)}`} className="flex h-12 items-center justify-center rounded-2xl bg-wine text-sm font-bold text-cream">Já tenho conta</Link><Link href={`/cadastro?next=${encodeURIComponent(next)}`} className="flex h-12 items-center justify-center rounded-2xl border border-wine/10 bg-cream text-sm font-bold text-wine">Criar minha conta</Link></div>}
    </div>
  </main>;
}
