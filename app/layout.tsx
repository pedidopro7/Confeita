import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Confeita',
  description: 'Sua confeitaria organizada. Suas receitas protegidas. Seus custos sob controle.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
