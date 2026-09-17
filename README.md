# Confeita

SaaS de gestão para confeiteiros, doceiros, boleiros e ateliês de confeitaria.

## Proposta

A Confeita conecta o fluxo inteiro da operação:

**Pedido → Produto → Receita secreta → Ingredientes → Estoque → Produção → Custo → Lucro**

O produto foi desenhado para parecer simples na superfície e manter uma estrutura de gestão robusta por baixo.

## Pilares

- Encomendas e agenda
- Produção
- Estoque inteligente
- Custos e precificação
- Financeiro
- Clientes e CRM
- Compras e fornecedores
- Equipe e permissões
- **Cofre de Receitas** com acesso restrito e histórico
- Modelo SaaS multitenant com cobrança recorrente

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth / PostgreSQL / RLS / Storage / Realtime
- PWA
- Vercel

## Identidade

Cores principais:

- Vinho `#4B1F36`
- Terracota `#C97663`
- Rosa antigo `#D8A7A0`
- Creme `#F9F3EB`
- Grafite `#3F3F3F`

A marca usa um **C circular inspirado de forma sutil em uma rosquinha**, com uma fechadura no espaço interno representando o Cofre de Receitas.

## Supabase

Projeto vinculado: `Confeita`

Ref: `sknzdhnjmmgqwfmiedkv`

Região: `sa-east-1`

A primeira migração estrutural já foi aplicada no projeto com:

- multitenancy por `business_id`;
- negócios e membros;
- planos e assinaturas;
- clientes;
- produtos e variações;
- inventário, lotes, reservas e movimentações;
- receitas, versões, componentes, permissões e logs;
- pedidos, itens e pagamentos;
- produção;
- compras e fornecedores;
- despesas e transações financeiras;
- auditoria;
- RLS habilitado nas tabelas de negócio.

## Variáveis de ambiente

Copie `.env.example` para `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Nunca versione segredos de backend.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Regra de UX

A interface não deve usar linguagem de ERP quando existir uma alternativa natural para confeitaria.

Exemplos:

- `Gerar OP` → **Começar produção**
- `Saída de matéria-prima` → **Produzi**
- `Movimentação de inventário` → **Corrigir estoque**

## Cofre de Receitas

A receita é tratada como patrimônio do negócio. O cadastro precisa transmitir confidencialidade e, tecnicamente, limitar o acesso ao menor número possível de pessoas.

O modo de preparo é opcional. Para o motor de estoque, o mínimo necessário é:

- ingredientes;
- quantidades;
- rendimento.

As próximas etapas devem reforçar RLS específico do Cofre, permissões granulares, auditoria de acesso, bloqueio automático e fluxos de produção protegida.
