import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LockKeyhole, UserRound, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

async function signIn(formData: FormData) {
  'use server';
  const email = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/painel');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const code = error.code ?? error.name ?? 'auth_error';
    const message = error.message ?? 'Falha de autenticação';
    console.error('[Confeita Auth]', {
      code,
      name: error.name,
      status: error.status,
      message
    });
    redirect(`/login?erro=${encodeURIComponent(message)}&codigo=${encodeURIComponent(code)}`);
  }

  redirect(next.startsWith('/') ? next : '/painel');
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const error = typeof params.erro === 'string' ? params.erro : null;
  const errorCode = typeof params.codigo === 'string' ? params.codigo : null;
  const next = typeof params.next === 'string' ? params.next : '/painel';
  const created = params.cadastro === 'ok';

  return (
    <main className="min-h-screen bg-cream px-4 py-8 md:grid md:place-items-center">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-wine/10 bg-white shadow-soft md:grid-cols-[.9fr_1.1fr]">
        <section className="hidden bg-wine p-10 text-cream md:flex md:flex-col md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Image src="/confeita-mark.svg" width={36} height={36} alt="Confeita" />
            </div>
            <div>
              <p className="m-0 text-2xl font-black tracking-[-0.04em]">confeita<span className="text-terracotta">.</span></p>
              <p className="m-0 text-[10px] uppercase tracking-[.22em] text-cream/50">gestão para confeitaria</p>
            </div>
          </div>
          <div>
            <LockKeyhole className="mb-5 text-terracotta" size={34} />
            <h1 className="max-w-md text-4xl font-black leading-tight tracking-[-0.04em]">Sua confeitaria organizada. Suas receitas protegidas.</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-cream/65">Pedidos, produção, estoque, custos e o Cofre de Receitas no mesmo lugar.</p>
          </div>
          <p className="text-xs text-cream/45">Seu jeito de fazer é parte do seu negócio.</p>
        </section>

        <section className="p-6 sm:p-10 md:p-12">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-wine"><Image src="/confeita-mark.svg" width={32} height={32} alt="Confeita" /></div>
            <p className="m-0 text-2xl font-black text-wine">confeita<span className="text-terracotta">.</span></p>
          </div>
          <p className="eyebrow mb-2">Acessar minha conta</p>
          <h2 className="m-0 text-3xl font-black tracking-[-0.04em] text-wine">Bem-vinda de volta</h2>
          <p className="mt-2 text-sm text-graphite/55">Entre para continuar cuidando da sua produção.</p>
          <div className="mt-4 rounded-2xl border border-terracotta/25 bg-terracotta/10 px-4 py-3 text-xs font-bold text-wine">
            Acesso de teste RC1 — <strong>flavia@admin.com</strong> · senha <strong>123456</strong>
            <div className="mt-1 font-medium text-wine/60">Supabase fixado: sknzdhnjmmgqwfmiedkv</div>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
              <div>{error}</div>
              {errorCode && <div className="mt-1 text-xs font-medium opacity-70">Código técnico: {errorCode}</div>}
            </div>
          )}
          {created && <div className="mt-5 rounded-2xl bg-success/10 px-4 py-3 text-sm font-semibold text-success">Conta criada. Confirme seu e-mail se o Supabase solicitar e depois entre.</div>}

          <form action={signIn} className="mt-8 space-y-4">
            <input type="hidden" name="next" value={next} />
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-graphite/65">E-mail</span>
              <div className="flex items-center gap-3 rounded-2xl border border-wine/10 bg-cream/45 px-4">
                <UserRound size={17} className="text-wine/45" />
                <input required name="identifier" type="email" autoComplete="username" placeholder="voce@confeitaria.com" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-graphite/30" />
              </div>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-graphite/65">Senha</span>
              <div className="flex items-center gap-3 rounded-2xl border border-wine/10 bg-cream/45 px-4">
                <LockKeyhole size={17} className="text-wine/45" />
                <input required name="password" type="password" autoComplete="current-password" placeholder="Sua senha" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-graphite/30" />
              </div>
            </label>
            <button className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-wine text-sm font-bold text-cream transition hover:opacity-95">
              Entrar <ArrowRight size={17} />
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-graphite/55">Ainda não usa a Confeita? <Link href="/cadastro" className="font-bold text-wine">Criar conta</Link></p>
        </section>
      </div>
    </main>
  );
}
