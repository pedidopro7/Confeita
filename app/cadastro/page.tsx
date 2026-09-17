import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

async function signUp(formData: FormData) {
  'use server';
  const fullName = String(formData.get('full_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (fullName.length < 2) redirect('/cadastro?erro=' + encodeURIComponent('Informe seu nome.'));
  if (password.length < 8) redirect('/cadastro?erro=' + encodeURIComponent('A senha precisa ter pelo menos 8 caracteres.'));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if (error) redirect('/cadastro?erro=' + encodeURIComponent(error.message));
  if (data.session) redirect('/onboarding');
  redirect('/login?cadastro=ok');
}

export default async function CadastroPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const error = typeof params.erro === 'string' ? params.erro : null;

  return (
    <main className="min-h-screen bg-cream px-4 py-8 md:grid md:place-items-center">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-wine/10 bg-white shadow-soft md:grid-cols-[.9fr_1.1fr]">
        <section className="hidden bg-wine p-10 text-cream md:flex md:flex-col md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Image src="/confeita-mark.svg" width={36} height={36} alt="Confeita" /></div>
            <p className="m-0 text-2xl font-black tracking-[-0.04em]">confeita<span className="text-terracotta">.</span></p>
          </div>
          <div>
            <div className="mb-5 inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-cream/80">14 dias para testar o fluxo completo</div>
            <h1 className="max-w-md text-4xl font-black leading-tight tracking-[-0.04em]">Do pedido ao lucro, sem perder ingrediente, prazo ou receita.</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-cream/65">Crie sua conta e configure sua confeitaria em poucos minutos.</p>
          </div>
          <p className="text-xs text-cream/45">Sem precisar mandar suas receitas por WhatsApp ou atendimento.</p>
        </section>

        <section className="p-6 sm:p-10 md:p-12">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-wine"><Image src="/confeita-mark.svg" width={32} height={32} alt="Confeita" /></div>
            <p className="m-0 text-2xl font-black text-wine">confeita<span className="text-terracotta">.</span></p>
          </div>
          <p className="eyebrow mb-2">Começar agora</p>
          <h2 className="m-0 text-3xl font-black tracking-[-0.04em] text-wine">Crie sua conta</h2>
          <p className="mt-2 text-sm text-graphite/55">Depois vamos montar o ambiente da sua confeitaria.</p>

          {error && <div className="mt-5 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{error}</div>}

          <form action={signUp} className="mt-8 space-y-4">
            <Field label="Seu nome" icon={<UserRound size={17} className="text-wine/45" />}>
              <input required name="full_name" autoComplete="name" placeholder="Mariana Silva" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-graphite/30" />
            </Field>
            <Field label="E-mail" icon={<Mail size={17} className="text-wine/45" />}>
              <input required name="email" type="email" autoComplete="email" placeholder="voce@confeitaria.com" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-graphite/30" />
            </Field>
            <Field label="Senha" icon={<LockKeyhole size={17} className="text-wine/45" />}>
              <input required name="password" type="password" minLength={8} autoComplete="new-password" placeholder="Mínimo 8 caracteres" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-graphite/30" />
            </Field>
            <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-wine text-sm font-bold text-cream">
              Criar minha conta <ArrowRight size={17} />
            </button>
          </form>
          <p className="mt-4 text-center text-[11px] leading-5 text-graphite/45">Ao continuar, você concorda com os termos e a política de privacidade da Confeita.</p>
          <p className="mt-5 text-center text-sm text-graphite/55">Já possui conta? <Link href="/login" className="font-bold text-wine">Entrar</Link></p>
        </section>
      </div>
    </main>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-graphite/65">{label}</span>
      <div className="flex items-center gap-3 rounded-2xl border border-wine/10 bg-cream/45 px-4">{icon}{children}</div>
    </label>
  );
}
