import type { Metadata } from 'next';
import './globals.css';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'Confeita',
  description: 'Sua confeitaria organizada. Suas receitas protegidas. Seus custos sob controle.',
  manifest: '/manifest.webmanifest',
  themeColor: '#4B1F36'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body><PwaRegister />{children}</body>
    </html>
  );
}
