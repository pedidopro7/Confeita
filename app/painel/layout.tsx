import { AppShell } from '@/components/app-shell';
import { getBusinessContext } from '@/lib/auth';

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const context = await getBusinessContext();
  if (!context) return null;
  const userName = context.user.fullName?.split(' ')[0] || context.user.email?.split('@')[0] || 'Confeiteira';

  return (
    <AppShell businessName={context.business.name} userName={userName} role={context.role} permissions={context.permissions}>
      {children}
    </AppShell>
  );
}
