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

4. **Dev server:**
   ```bash
   npm run dev
   ```
   Abrir <http://localhost:3000>.

   Na fase 0 (esqueleto), só a página inicial existe. Rotas (`/login`, `/leads`, etc.) chegam na Fase 1.

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
| `npm run db:seed` | Roda seed inicial |

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
