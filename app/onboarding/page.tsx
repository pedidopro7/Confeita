import { redirect } from 'next/navigation';
import { CakeSlice, Check, Cookie, Croissant, LockKeyhole, MapPin, Phone, Store } from 'lucide-react';
import { getBusinessContext, requireUser } from '@/lib/auth';

async function createBusiness(formData: FormData) {
  'use server';
  const { supabase, user } = await requireUser();
  const name = String(formData.get('business_name') ?? '').trim();
  const whatsapp = String(formData.get('whatsapp') ?? '').trim();
  const city = String(formData.get('city') ?? '').trim();
  const segments = formData.getAll('segments').map(String);

  if (name.length < 2) redirect('/onboarding?erro=' + encodeURIComponent('Informe o nome da sua confeitaria.'));

  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'confeitaria';
  const slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;

  const { error } = await supabase.from('businesses').insert({
    owner_user_id: user.id,
    name,
    slug,
    whatsapp: whatsapp || null,
    city: city || null,
    settings: {
      onboarding_stage: 'workspace_created',
      segments,
      deposit_mode: 'percentage',
      deposit_value: 50,
      currency: 'BRL'
    }
  });

  if (error) redirect('/onboarding?erro=' + encodeURIComponent('Não foi possível criar seu ambiente. Tente novamente.'));
  if (whatsapp) await supabase.from('profiles').update({ phone: whatsapp }).eq('id', user.id);
  redirect('/painel?primeiro_acesso=1');
}

const segments = [
  ['Bolos', CakeSlice],
  ['Doces', Cookie],
  ['Brownies e cookies', Cookie],
  ['Cupcakes', CakeSlice],
  ['Sobremesas', Croissant],
  ['Kits para festas', Store]
] as const;

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const existing = await getBusinessContext({ allowMissingBusiness: true });
  if (existing) redirect('/painel');
  const params = await searchParams;
  const error = typeof params.erro === 'string' ? params.erro : null;

  return (
    <main className="min-h-screen bg-cream px-4 py-7 md:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-2xl font-black tracking-[-0.04em] text-wine">confeita<span className="text-terracotta">.</span></p>
            <p className="m-0 text-[10px] uppercase tracking-[.22em] text-wine/40">configuração inicial</p>
          </div>
          <span className="rounded-full bg-white px-3 py-2 text-[10px] font-bold text-wine shadow-sm">Passo 1 de 4</span>
        </div>

        <section className="panel p-5 sm:p-8 md:p-10">
          <div className="mb-8 grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
            <div>
              <p className="eyebrow mb-2">Vamos preparar seu ambiente</p>
              <h1 className="m-0 text-3xl font-black tracking-[-0.04em] text-wine md:text-4xl">Conte um pouco sobre sua confeitaria.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-graphite/55">Depois vamos cadastrar ingredientes, produtos e conectar suas fórmulas no Cofre.</p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-wine text-cream"><LockKeyhole size={24} /></div>
          </div>

          {error && <div className="mb-5 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{error}</div>}

          <form action={createBusiness} className="space-y-5">
            <Field label="Nome da confeitaria" icon={<Store size={18} />}>
              <input name="business_name" required placeholder="Ex.: Doce Ateliê" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-graphite/30" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="WhatsApp" icon={<Phone size={18} />}>
                <input name="whatsapp" inputMode="tel" placeholder="(11) 99999-9999" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-graphite/30" />
              </Field>
              <Field label="Cidade" icon={<MapPin size={18} />}>
                <input name="city" placeholder="Sua cidade" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-graphite/30" />
              </Field>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold text-graphite/65">O que você vende? <span className="font-normal text-graphite/40">Pode marcar mais de um.</span></p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {segments.map(([label, Icon]) => (
                  <label key={label} className="group cursor-pointer rounded-2xl border border-wine/10 bg-cream/45 p-4 transition has-[:checked]:border-terracotta has-[:checked]:bg-terracotta/10">
                    <input className="peer sr-only" type="checkbox" name="segments" value={label} />
                    <div className="mb-4 flex items-center justify-between"><Icon size={19} className="text-wine/55" /><Check size={17} className="opacity-0 text-terracotta peer-checked:opacity-100" /></div>
                    <span className="text-xs font-bold text-graphite">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button className="flex h-13 w-full items-center justify-center rounded-2xl bg-wine px-5 py-3.5 text-sm font-bold text-cream">Criar meu ambiente</button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-graphite/65">{label}</span>
      <div className="flex items-center gap-3 rounded-2xl border border-wine/10 bg-cream/45 px-4 text-wine/45">{icon}{children}</div>
    </label>
  );
}
