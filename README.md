# CRM Credios

Sistema interno de gestão de leads da **Credios** para o produto **CGI** (Crédito com Garantia de Imóvel). Substitui a database "CRM de Leads" no Notion.

> Briefing técnico vinculante: ver [`CLAUDE.md`](./CLAUDE.md). Toda decisão fora do briefing deve ser perguntada antes de implementada.

## Stack

- **Next.js** (App Router) + TypeScript strict + Tailwind CSS 4
- **shadcn/ui** (style `base-nova`, base color `neutral`)
- **Supabase** (Postgres + Auth + Storage)
- **Drizzle ORM** + drizzle-kit (migrations versionadas em `db/migrations`)
- **Zod** + React Hook Form + sonner + TanStack Table v8 + dnd-kit + Recharts + date-fns
- **Resend** para email transacional
- Deploy: Vercel em `crm.credios.com.br`

> **Observação de versão:** o briefing fixa Next.js 15.x mas o `create-next-app@latest` instalou **16.2.4**. Como Next 16 introduz mudanças (eslint flat config diferente, etc.), seguir com 16. Para fixar 15: `npm install next@^15 eslint-config-next@^15` e regenerar configs.

## Setup local

1. **Clonar:**
   ```bash
   git clone https://github.com/credios/credios-crm.git
   cd credios-crm
   ```

2. **Instalar dependências:**
   ```bash
   npm install
   ```

3. **Variáveis de ambiente:**
   Copiar `.env.local.example` para `.env.local` e preencher com os valores reais (credenciais ficam fora do repositório).
   ```bash
   cp .env.local.example .env.local
   ```
   > Senhas Postgres com caracteres especiais (`+ * / # @`) precisam estar **URL-encoded** na `DATABASE_URL`.

4. **Banco de dados** (ver seção [Banco de dados](#banco-de-dados) para o passo-a-passo completo).

5. **Dev server:**
   ```bash
   npm run dev
   ```
   Abrir <http://localhost:3000>.

   Na fase 0 (esqueleto), só a página inicial existe. Rotas (`/login`, `/leads`, etc.) chegam na Fase 2 em diante.

## Scripts

| Script | Descrição |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Build de produção |
| `npm run start` | Servidor de produção |
| `npm run lint` | ESLint |
| `npm run db:generate` | Gera migration a partir do schema |
| `npm run db:migrate` | Aplica migrations no banco |
| `npm run db:push` | Sincroniza schema diretamente (dev) |
| `npm run db:studio` | Abre Drizzle Studio |
| `npm run db:policies` | Aplica `db/policies.sql` (RLS, view, triggers) |
| `npm run db:seed` | Roda seed inicial (2 usuários + 5 templates) |

## Banco de dados

Schema em [`db/schema.ts`](db/schema.ts). Migrations versionadas em [`db/migrations/`](db/migrations/). Policies de RLS, view de masking e triggers em [`db/policies.sql`](db/policies.sql) (aplicação manual). Seed de usuários iniciais e templates em [`db/seed.ts`](db/seed.ts).

### Primeira aplicação (projeto novo)

1. **Confirmar `DATABASE_URL` em `.env.local`** (senha URL-encoded). Ver [`.env.local.example`](.env.local.example).

2. **Aplicar a migration de schema:**
   ```bash
   npm run db:migrate
   ```
   Isso roda `db/migrations/0000_useful_caretaker.sql` no Supabase. Verifica via dashboard que as 9 tabelas, 5 enums e 8 índices foram criados.

   > Alternativa para dev rápido (sem versionamento): `npm run db:push` empurra o schema atual direto para o banco. Não usar em prod.

3. **Aplicar policies/triggers/view:**
   ```bash
   npm run db:policies
   ```
   Roda `db/apply-policies.ts`, que executa `db/policies.sql` via `postgres-js`. Idempotente (cada policy tem `DROP POLICY IF EXISTS` antes do `CREATE POLICY`). Alternativa manual: copiar o conteúdo de [`db/policies.sql`](db/policies.sql) para o SQL Editor do Supabase Dashboard.

4. **Rodar seed (cria 2 usuários no Supabase Auth + 5 templates):**
   ```bash
   npm run db:seed
   ```
   O script é idempotente — pode ser rodado múltiplas vezes sem duplicar.

### Workflow de mudanças no schema

1. Editar `db/schema.ts`.
2. `npm run db:generate` → cria nova migration em `db/migrations/`.
3. Revisar o SQL gerado (commitado no repo).
4. `npm run db:migrate` para aplicar no Supabase.
5. Se a mudança envolver RLS/policies, atualizar `db/policies.sql` e re-aplicar manualmente.

### Validação RLS (Fase 1)

Via SQL Editor do Supabase, simular um usuário (`SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '<UUID>';`) e checar:
- Admin vê todos os leads.
- Consultor vê só os atribuídos.
- Marketing vê 0 rows na tabela `leads`, e dados mascarados em `leads_marketing`.
- audit_log: só admin lê.

Comandos exatos no rodapé de [`db/policies.sql`](db/policies.sql).

## Estrutura de pastas

Layout completo em `CLAUDE.md` §8. Diretórios criados na Fase 0 ficam vazios (com `.gitkeep`); arquivos chegam ao longo das fases.

```
credios-crm/
├── CLAUDE.md                       # briefing vinculante
├── db/
│   ├── schema.ts                   # Drizzle schema (Fase 1)
│   ├── seed.ts                     # seed inicial (Fase 1)
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (auth)/                 # login, recuperar-senha, primeiro-acesso
│   │   ├── (app)/                  # leads, relatorios, configuracoes, audit, perfil
│   │   └── api/                    # webhooks, leads, cron, etc.
│   ├── components/
│   │   ├── ui/                     # shadcn copy-paste
│   │   ├── leads/ relatorios/ shared/
│   ├── lib/
│   │   ├── supabase/               # client, server, middleware
│   │   ├── auth/ routing/ notifications/ validators/ formatters/
│   │   └── db.ts utils.ts
│   ├── types/
│   └── middleware.ts
├── tests/
├── drizzle.config.ts
└── components.json                 # shadcn
```

## Convenções

- **pt-BR** em UI, comentários e mensagens de commit.
- **TS strict** habilitado.
- **Zod** em toda entrada de dados (forms, webhooks, API routes).
- **LGPD**: dados sensíveis (CPF, renda) com mascaramento por perfil — ver `CLAUDE.md` §5.
- **Configurabilidade pelo Admin via UI**: regras de roteamento e templates de mensagem editáveis sem mexer em código.
- **Idempotência** nas integrações (webhook do site pode retentar — não duplicar leads).

## Roadmap

Critérios de aceitação do MVP em `CLAUDE.md` §12. Fora do escopo do MVP em §7 (documentos, WhatsApp Business, Ads offline, parceiros externos, outros produtos).

## Licença

Privado, propriedade da Credios.
