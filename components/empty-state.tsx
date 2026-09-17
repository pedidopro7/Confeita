import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, title, description, actionHref, actionLabel }: { icon: LucideIcon; title: string; description: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="panel flex min-h-64 flex-col items-center justify-center p-8 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-cream text-wine"><Icon size={24} strokeWidth={1.8} /></div>
      <h2 className="m-0 text-xl font-black tracking-[-0.03em] text-wine">{title}</h2>
      <p className="mb-0 mt-2 max-w-md text-sm leading-6 text-graphite/50">{description}</p>
      {actionHref && actionLabel && <Link href={actionHref} className="mt-5 rounded-2xl bg-wine px-4 py-3 text-sm font-bold text-cream">{actionLabel}</Link>}
    </div>
  );
}
