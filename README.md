# Confeita

SaaS completo de gestão para confeiteiros, doceiros, boleiros e ateliês de confeitaria.

## Visão

A Confeita conecta pedidos, produtos, receitas confidenciais, ingredientes, estoque, produção, custos e financeiro em um único ambiente multitenant.

### Núcleo do produto

Pedido → Produto → Cofre de Receitas → Ingredientes → Estoque → Produção → Custo → Lucro.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase (PostgreSQL, Auth, RLS, Storage)
- Vercel
- PWA em evolução

## Segurança

O Cofre de Receitas usa isolamento por `business_id`, RLS e permissões específicas. Fórmulas completas não fazem parte do backoffice operacional comum do SaaS.

## Desenvolvimento

Variáveis obrigatórias:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Execute:

```bash
npm install
npm run dev
```
