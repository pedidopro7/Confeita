'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, Calculator, CalendarDays, ChevronDown, ClipboardList, Cookie, DollarSign,
  FileText, LockKeyhole, LogOut, Menu, PackageOpen, Plus, Settings, ShoppingBasket, Sparkles,
  UsersRound, X
} from 'lucide-react';
import { useState } from 'react';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  secure?: boolean;
  ownerOnly?: boolean;
  roles?: string[];
  permission?: string;
};

const nav: NavItem[] = [
  { href: '/painel', label: 'Início', icon: Sparkles },
  { href: '/painel/agenda', label: 'Agenda', icon: CalendarDays, roles: ['owner','manager','service','production'] },
  { href: '/painel/orcamentos', label: 'Orçamentos', icon: FileText, roles: ['owner','manager','service'], permission: 'manage_quotes' },
  { href: '/painel/pedidos', label: 'Pedidos', icon: ClipboardList, roles: ['owner','manager','service','production'], permission: 'manage_orders' },
  { href: '/painel/producao', label: 'Produção', icon: Cookie, roles: ['owner','manager','production'], permission: 'manage_production' },
  { href: '/painel/produtos', label: 'Produtos', icon: PackageOpen, roles: ['owner','manager'], permission: 'manage_products' },
  { href: '/painel/cofre', label: 'Cofre', icon: LockKeyhole, secure: true, ownerOnly: true },
  { href: '/painel/estoque', label: 'Estoque', icon: PackageOpen, roles: ['owner','manager','stock','production'], permission: 'adjust_stock' },
  { href: '/painel/compras', label: 'Compras', icon: ShoppingBasket, roles: ['owner','manager','stock'], permission: 'manage_purchases' },
  { href: '/painel/clientes', label: 'Clientes', icon: UsersRound, roles: ['owner','manager','service'], permission: 'view_customers' },
  { href: '/painel/precificacao', label: 'Precificação', icon: Calculator, ownerOnly: true },
  { href: '/painel/financeiro', label: 'Financeiro', icon: DollarSign, roles: ['owner','manager','finance'], permission: 'manage_finance' },
  { href: '/painel/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['owner','manager','finance'], permission: 'view_revenue' },
  { href: '/painel/equipe', label: 'Equipe', icon: UsersRound, ownerOnly: true },
  { href: '/painel/configuracoes', label: 'Configurações', icon: Settings, ownerOnly: true }
];

export function AppShell({ children, businessName, userName, role, permissions }: { children: React.ReactNode; businessName: string; userName: string; role: string; permissions: Record<string, boolean> }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleNav = nav.filter((item) => {
    if (item.ownerOnly) return role === 'owner';
    if (!item.roles?.length) return true;
    return item.roles.includes(role) || Boolean(item.permission && permissions[item.permission]);
  });
  const plusHref = role === 'stock' ? '/painel/compras' : role === 'finance' ? '/painel/financeiro' : role === 'production' ? '/painel/producao' : '/painel/pedidos/novo';

  return (
    <div className="min-h-screen bg-cream md:grid md:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-wine/10 bg-white/70 p-4 backdrop-blur md:flex md:flex-col">
        <Link href="/painel" className="mb-7 flex items-center gap-3 px-2 py-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-wine shadow-soft"><Image src="/confeita-mark.svg" alt="Confeita" width={32} height={32} /></div>
          <div><p className="m-0 text-xl font-black tracking-[-.04em] text-wine">confeita<span className="text-terracotta">.</span></p><p className="m-0 text-[9px] uppercase tracking-[.2em] text-wine/40">gestão para confeitaria</p></div>
        </Link>
        <nav className="min-h-0 flex-1 overflow-y-auto pr-1"><div className="space-y-1">{visibleNav.map((item) => <NavLink key={item.href} {...item} active={pathname === item.href || (item.href !== '/painel' && pathname.startsWith(item.href + '/'))} />)}</div></nav>
        <div className="mt-4 rounded-2xl border border-wine/10 bg-cream/65 p-3">
          <div className="mb-3 flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose/45 text-xs font-black text-wine">{userName.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="m-0 truncate text-xs font-bold text-graphite">{userName}</p><p className="m-0 truncate text-[10px] text-graphite/45">{businessName}</p></div><ChevronDown size={14} className="text-wine/35" /></div>
          <form action="/auth/logout" method="post"><button className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-wine"><LogOut size={14} /> Sair</button></form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-wine/10 bg-cream/90 px-4 backdrop-blur md:hidden"><Link href="/painel" className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-wine"><Image src="/confeita-mark.svg" alt="Confeita" width={27} height={27} /></div><span className="text-xl font-black text-wine">confeita<span className="text-terracotta">.</span></span></Link><button onClick={() => setMenuOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-wine/10 bg-white text-wine" aria-label="Abrir menu"><Menu size={19} /></button></header>
        <main className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-5 sm:px-6 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>

      <nav className="fixed bottom-3 left-1/2 z-30 flex w-[calc(100%-24px)] max-w-md -translate-x-1/2 items-center justify-around rounded-3xl border border-wine/10 bg-white/95 px-2 py-2 shadow-soft backdrop-blur md:hidden">
        <MobileLink href="/painel" label="Início" icon={Sparkles} active={pathname === '/painel'} />
        <MobileLink href="/painel/pedidos" label="Pedidos" icon={ClipboardList} active={pathname.startsWith('/painel/pedidos')} />
        <Link href={plusHref} className="-mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-wine text-cream shadow-soft" aria-label="Ação principal"><Plus /></Link>
        <MobileLink href="/painel/producao" label="Produção" icon={Cookie} active={pathname.startsWith('/painel/producao')} />
        <button onClick={() => setMenuOpen(true)} className="flex min-w-12 flex-col items-center gap-1 text-[9px] font-bold text-graphite/45"><Menu size={18} />Mais</button>
      </nav>

      {menuOpen && <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm md:hidden" onClick={() => setMenuOpen(false)}><div className="absolute right-0 top-0 h-full w-[86%] max-w-sm overflow-y-auto bg-cream p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-6 flex items-center justify-between"><div><p className="m-0 font-black text-wine">{businessName}</p><p className="m-0 text-[10px] uppercase tracking-[.15em] text-graphite/40">{role}</p></div><button onClick={() => setMenuOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-wine"><X size={18} /></button></div><div className="space-y-1">{visibleNav.map((item) => <div key={item.href} onClick={() => setMenuOpen(false)}><NavLink {...item} active={pathname === item.href || (item.href !== '/painel' && pathname.startsWith(item.href + '/'))} /></div>)}</div><form className="mt-6" action="/auth/logout" method="post"><button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-wine/10 bg-white px-4 py-3 text-sm font-bold text-wine"><LogOut size={16} /> Sair da conta</button></form></div></div>}
    </div>
  );
}

function NavLink({ href, label, icon: Icon, active, secure }: NavItem & { active: boolean }) {
  return <Link href={href} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-xs font-bold transition ${active ? 'bg-wine text-cream' : 'text-graphite/60 hover:bg-wine/5 hover:text-wine'}`}><Icon size={17} /><span className="flex-1">{label}</span>{secure && <span className={`text-[8px] uppercase tracking-[.12em] ${active ? 'text-cream/55' : 'text-wine/35'}`}>privado</span>}</Link>;
}

function MobileLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ComponentType<{ size?: number }>; active: boolean }) {
  return <Link href={href} className={`flex min-w-12 flex-col items-center gap-1 text-[9px] font-bold ${active ? 'text-wine' : 'text-graphite/40'}`}><Icon size={18} />{label}</Link>;
}
