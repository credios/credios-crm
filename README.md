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

5. **Configurar Auth no Supabase Dashboard** (necessário antes do primeiro login — ver seção [Autenticação](#autenticação)).

6. **Dev server:**
   ```bash
   npm run dev
   ```
   Abrir <http://localhost:3000>. A raiz redireciona para `/login`. Após autenticar, a app monta sidebar + conteúdo.

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

## Autenticação

Implementação completa em [§6.1 do CLAUDE.md](./CLAUDE.md). Stack: Supabase Auth (Google OAuth + email/senha + MFA TOTP) + Next.js App Router + middleware (`src/proxy.ts`).

### Configuração do Supabase Dashboard (uma vez por ambiente)

1. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` em dev, `https://crm.credios.com.br` em prod.
   - **Redirect URLs** (adicionar todos):
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/recuperar-senha/confirmar`
     - `https://crm.credios.com.br/auth/callback`
     - `https://crm.credios.com.br/recuperar-senha/confirmar`

2. **Authentication → Providers → Google**: habilitar e colar `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Authorized redirect URI no Google Console: `https://djpzmyaemxifqxawenua.supabase.co/auth/v1/callback`.

3. **Authentication → SMTP** (opcional mas recomendado para emails de recuperação): trocar SMTP padrão do Supabase pelo **Resend**:
   - Host: `smtp.resend.com`
   - Port: `587`
   - User: `resend`
   - Pass: `RESEND_API_KEY` (de `.env.local`)
   - Sender name: `CRM Credios`
   - Sender email: `crm@credios.com.br`

   Sem essa config, recuperação de senha usa o SMTP nativo do Supabase, com rate limit de 4 emails/h em projetos novos.

### Fluxos implementados

- `/login` — Google OAuth (preferencial) + email/senha
- `/recuperar-senha` → email com link → `/recuperar-senha/confirmar` para definir nova senha
- `/primeiro-acesso` — coleta `nome` quando vazio; força enrollment de TOTP para admin sem MFA
- `/auth/desafio-mfa` — step-up MFA (admin com sessão AAL1 precisa subir para AAL2)
- `/perfil` — editar nome/whatsapp, definir senha (para login email/senha), ver/desativar 2FA (admin não pode desativar)
- `/auth/logout` (POST) — encerra sessão + grava `audit_log`
- `/auth/callback` (GET) — finaliza OAuth (PKCE) + grava `audit_log`

### Gating

- **`src/proxy.ts`** (Next 16 renomeou middleware → proxy): exige autenticação para tudo exceto `/login`, `/recuperar-senha`, `/auth/*`, `/api/webhooks/*`. Logado tentando acessar `/login` → redireciona para `/leads`.
- **`src/app/(app)/layout.tsx`**: server-side gate adicional — checa `users.nome` (vazio → `/primeiro-acesso`), checa MFA enrolment para admin, checa AAL2 para admin com factor.
- **`src/app/(app)/configuracoes/layout.tsx` e `audit/layout.tsx`**: bloqueiam não-admin → `/sem-permissao`.

### Audit log

Eventos gravados em `audit_log` (via Drizzle, bypassa RLS):
- `login` — em `/auth/callback` e em `signInWithPassword`
- `logout` — em `/auth/logout`
- `perfil_editado`, `senha_atualizada`, `mfa_desativado` — server actions de `/perfil`

Logs do middleware (proxy) são intencionalmente omitidos: roda no Edge runtime, sem suporte a TCP socket do `postgres-js`.

### Estado dos usuários do seed

- **Gabriel** (`gabriel@credios.com.br`, admin): `nome` preenchido, sem senha, sem MFA. Primeiro login via Google → forçado para `/primeiro-acesso` enrolar TOTP.
- **Rodrigo** (`rodrigo@credios.com.br`, consultor): `nome` preenchido, sem senha, sem MFA. Login via Google → vai direto para `/leads`.

Para usar email/senha, fazer "esqueci minha senha" para definir senha inicial (ou definir manualmente em `/perfil` após primeiro login Google).

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
│   └── proxy.ts                    # Next 16: era middleware.ts em <16
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
