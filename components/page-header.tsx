import Link from 'next/link';
import { Plus } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, actionHref, actionLabel = 'Novo' }: { eyebrow?: string; title: string; description?: string; actionHref?: string; actionLabel?: string }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="m-0 text-3xl font-black tracking-[-0.04em] text-wine md:text-4xl">{title}</h1>
        {description && <p className="mb-0 mt-2 max-w-2xl text-sm leading-6 text-graphite/55">{description}</p>}
      </div>
      {actionHref && <Link href={actionHref} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-wine px-4 text-sm font-bold text-cream"><Plus size={17} />{actionLabel}</Link>}
    </header>
  );
}
