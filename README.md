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

## Leads — ingestão e operações (Fase 3)

### Webhook de ingestão

`POST /api/webhooks/lead` — endpoint público para o site da Credios (substitui o destino atual no Notion).

**Headers obrigatórios:**
- `x-webhook-secret: $WEBHOOK_SECRET` (compare timing-safe)
- `content-type: application/json`

**Resposta:**
- `201 { leadId, duplicate: false, possivelDuplicidadeCpf }` — lead criado
- `200 { duplicate: true, leadId }` — payload idêntico recebido em <60s
- `400 { error, details }` — payload inválido
- `401 { error: "unauthorized" }` — secret faltando ou errado

**Comportamento:**
- **Idempotência**: SHA256 das top-level keys ordenadas; janela de 60s via tabela `webhook_idempotency`
- **CPF duplicado**: NÃO bloqueia — cria o lead e registra row em `duplicidades_pendentes` para revisão manual (CLAUDE.md §6.2)
- **Routing**: MVP placeholder → `consultor_id = null` (pool); engine real entra na Fase 4
- **Email para admins**: dispara via Resend se `foraHorarioComercial()` (08:00-18:00 BRT seg-sex; sem feriados ainda — TODO)
- **Audit**: grava `lead_criado_webhook` com metadata de routing
- **Interação automática**: insere `evento_sistema` no timeline do lead

**Exemplo cURL:**
```bash
curl -X POST http://localhost:3000/api/webhooks/lead \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -H "content-type: application/json" \
  -d '{
    "nome": "João Silva",
    "whatsapp": "+5547999990001",
    "cpf": "12345678901",
    "email": "joao@example.com",
    "valor_credito": 350000,
    "valor_imovel": 900000,
    "renda_mensal": 12000,
    "cidade": "Blumenau",
    "estado": "SC",
    "tipo_imovel": "Casa",
    "situacao_imovel": "Quitado",
    "origem": "YouTube",
    "utm_campaign": "campanha-x"
  }'
```

### APIs autenticadas (sessão Supabase)

| Método | Rota | Quem | Notas |
|---|---|---|---|
| GET | `/api/leads` | qualquer authenticated | filtros: status, consultorId, origem, q (nome/email/cpf/telefone), valorMin/Max, dataDe/Ate; paginação 50 default; consultor vê só atribuídos; marketing recebe leads mascarados |
| POST | `/api/leads` | admin/gerente/consultor | criação manual; consultor não pode atribuir a outro |
| GET | `/api/leads/[id]` | conforme RLS app | inclui timeline com `autorNome` via JOIN |
| PATCH | `/api/leads/[id]` | admin/gerente; consultor (atribuído) | edita campos do lead; ignora `consultorId` (use endpoint próprio) |
| PATCH | `/api/leads/[id]/status` | mesmo de update; reabertura de fechado só admin | exige `bancoAprovador`/`valorLiberadoCentavos`/`comissaoCentavos`/`dataFechamento` p/ status `fechado`; exige `motivoDesqualificacao` p/ `desqualificado`/`perdido` |
| PATCH | `/api/leads/[id]/atribuicao` | admin/gerente | `{ consultorId: uuid \| null }`; cria interação `mudanca_atribuicao` |
| POST | `/api/leads/[id]/interacoes` | admin/gerente; consultor (atribuído) | tipos: ligacao, whatsapp_*, email, reuniao, anotacao, documento_recebido; atualiza `ultimo_contato` |

### Mascaramento (perfil `marketing`)

`src/lib/auth/mascaramento.ts` aplica server-side ao response de listas/detalhes:
- `cpf` → `***.***.***-XX`
- `email` → `***@dominio.com`
- `whatsapp` → `null`
- `rendaMensalCentavos` → `null` + adiciona `rendaFaixa` ("Até R$ 5k", "R$ 5k–10k", etc.)
- `bancoAprovador` / `valorLiberadoCentavos` / `comissaoCentavos` → `null`

A view `leads_marketing` no Postgres (Fase 1) faz o mesmo masking — mas o backend prefere fazer em JS pra simplicidade (single query path com Drizzle).

### Permissions

`src/lib/auth/permissions.ts` exporta `checkPermission(user, action, resource?)` usado nos route handlers. Actions: `lead.list`, `lead.read`, `lead.create`, `lead.update`, `lead.assign`, `lead.change_status`, `interacao.create`, `user.manage`, `config.manage`, `audit.read`. Para `lead.read/update/change_status/interacao.create` em consultor, o `resource.consultorId` precisa bater com `user.id`.

### Audit log estendido

Eventos novos gravados:
- `lead_criado_webhook`, `lead_criado_manual`
- `lead_visualizado`, `lead_editado`
- `lead_status_mudou` (metadata: `de`, `para`, e campos extras se terminal)
- `lead_atribuido` (metadata: `de`, `para`)
- `interacao_criada` (metadata: `interacaoId`, `tipo`)

### Engine de roteamento (Fase 4)

Implementação em `src/lib/routing/`:
- **`types.ts`** — `RoutingContext`, `RoutingRule`, `RoutingDeps`, `RuleCondicoes`
- **`conditions.ts`** — `matchesConditions(ctx, conds)` (pura, AND lógico)
- **`round-robin.ts`** — `pickNextRoundRobin(regraId, grupo, { dryRun? })` com `SELECT … FOR UPDATE` em transação Drizzle (protege contra race condition)
- **`engine.ts`** — `aplicarRoteamento(ctx, deps, options?)` recebe deps via DI (mockáveis em tests). Avalia regras ativas em ordem de prioridade desc; primeira que bate executa ação e retorna; falha de execução cai para pool com warning.
- **`db-deps.ts`** — `realRoutingDeps` (produção, lê regras do banco)
- **`context.ts`** — `contextFromWebhook(payload)` e `contextFromCreateLead(input)` para normalizar inputs

**Tipos de condição** (todas opcionais, AND lógico): `valor_credito_min/max`, `valor_imovel_min/max` (centavos), `estado_in[]`, `origem_in[]`, `tipo_imovel_in[]`, `horario_comercial: bool`.

**Tipos de ação**:
- `atribuir_usuario` → `parametros.usuario_id` (UUID)
- `round_robin_grupo` → `parametros.grupo_usuarios[]` (UUIDs, ordem importa)
- `pool_nao_atribuido` → sem parâmetros (lead fica sem `consultor_id`)

**Integrações**:
- Webhook (`POST /api/webhooks/lead`) → engine roda automático
- Criação manual (`POST /api/leads`) → engine roda **se admin/gerente não escolheu consultor explicitamente**; consultor sempre vira dono do lead que cria

**APIs do CRUD de regras** (admin only):
- `GET/POST /api/configuracoes/roteamento`
- `PATCH/DELETE /api/configuracoes/roteamento/[id]`
- `POST /api/configuracoes/roteamento/reorder` (body: `{ ids: [...] }`, top = maior prioridade, espaçamento ×10)
- `POST /api/configuracoes/roteamento/testar` (dry-run; retorna `{ regraAplicada, consultorId, consultorNome }`)

**UI** em `/configuracoes/roteamento` (admin only):
- **Testar engine** no topo (form simples + botão → mostra qual regra dispararia)
- **Lista** de regras com drag-and-drop pra reordenar (dnd-kit/sortable), toggle ativa/inativa, editar, excluir (com confirmação)
- **Dialog de criar/editar**: nome, ativa, ConditionsEditor dinâmico (Add/Remove condições com checkboxes pra UFs/origens/tipos), ActionEditor (radio + parâmetros conditional)

**Tests** unitários (Vitest):
- `tests/routing-engine.test.ts` — 22 casos cobrindo `matchesConditions` (todos os tipos), `computeNext` (round-robin pure function), `aplicarRoteamento` (sem regras, match, no-match, prioridade, ativa=false, round-robin, dry-run, fallback)
- Engine recebe `deps` via DI → tests não tocam Postgres
- Rodar: `npm test` (single run) ou `npm run test:watch`

### Visualizações (Fase 5)

#### Lista (`/leads`)
- TanStack Table com colunas: nome (link pro detalhe), `<StatusBadge>`, valor buscado, WhatsApp (link `wa.me/`), origem, consultor, último contato (relativo + ❄️ se esfriando), criado em
- Filtros via URL params: `status`, `consultorId`, `origem`, `estado`, `dispositivo`, `valorMin`/`valorMax` (em centavos), `dataDe`/`dataAte` (YYYY-MM-DD), `q` (busca em nome/email/cpf/whatsapp)
- Busca debounced 300ms; filtros sincronizados na URL → bookmarkáveis e compartilháveis
- Paginação server-side, 50 por página, navegação anterior/próxima
- Seleção múltipla (checkbox no header + por linha) com toolbar de ações em lote: **Reatribuir**, **Mudar status** (não-terminais; pra fechar/desqualificar tem que ser individual), **Exportar CSV** (gera `text/csv;charset=utf-8` com BOM, escape RFC 4180, nome `leads-YYYY-MM-DD.csv`)
- Toggle Lista/Kanban no topo preserva todos os filtros via query string

#### Kanban (`/leads/kanban`)
- 10 colunas (uma por status), header da coluna com cor (mesmo mapping do `<StatusBadge>`), label, contador, somatório do valor buscado em formato curto
- Cards com nome, valor (`R$ 350K` formato curto), badges de origem + UF, último contato relativo, avatar com iniciais do consultor (ou "pool"), ❄️ se esfriando
- Drag-and-drop entre colunas via `@dnd-kit/core` com `useDraggable` no card e `useDroppable` na coluna; activation distance 6px (não roubam clicks no link do nome)
- Drop em status terminal (`fechado`/`desqualificado`/`perdido`) abre modal pedindo dados extras antes de aplicar — drop não-terminal aplica direto via `PATCH /api/leads/[id]/status`
- Cap defensivo de 500 leads por carga; aviso quando atinge limite (refinar via filtros)
- Mesmos filtros da Lista; estado preservado via URL

#### Detalhe (`/leads/[id]`)
- **Header** com nome (h1), `<StatusBadge>`, valor buscado e botões: **Mudar status** (DropdownMenu separando não-terminais e terminais — terminais abrem modal), **Reatribuir** (Dialog com Select de consultor), **WhatsApp** (link `wa.me/`), **Copiar email** (clipboard + toast), **Marcar último contato** (cria interação `anotacao` com texto fixo). Lead `fechado` só aceita mudança de status por admin.
- **Coluna esquerda (60%)** com 4 cards usando `<LeadEditableCard>` (genérico):
  - Informações pessoais (nome, CPF, estado civil, ocupação, renda)
  - Contato (WhatsApp, email, cidade, UF)
  - Imóvel e crédito (objetivo, tipo imóvel, situação, tipo pessoa, valores; mostra dados de fechamento se status=fechado)
  - Origem (somente leitura, expande origem/utm/gclid/dispositivo/etc.)
  - Mensagens sugeridas: cards filtrados por `status_aplicavel @> ARRAY[<status>]`, com Preview (modal) e Copiar (substitui `{{nome}}`/`{{primeiro_nome}}`/`{{valor_credito}}`/`{{valor_imovel}}`/`{{cidade}}`/`{{estado}}`)
- **Coluna direita (40%)** com `<LeadTimeline>`: lista cronológica reversa de interações; ícone diferente por tipo; eventos de sistema em cinza; input no topo com Select de tipo + textarea + botão Registrar

#### Realtime

Hooks em `src/lib/realtime/`:
- `useLeadsRealtime()` — usado em `/leads` e `/leads/kanban`. Subscribe a `postgres_changes` em `leads` + `interacoes`; debounce 400ms → `router.refresh()`. RLS aplica via JWT do user (consultor recebe só events dos seus leads).
- `useInteracoesRealtime(leadId, onNew)` — usado em `/leads/[id]/timeline`. Filter `lead_id=eq.<id>`; novo event aparece instantâneo na timeline (com placeholder no `autorNome` até o próximo refresh popular via JOIN).

**Pré-requisito**: Replication habilitada para `public.leads` e `public.interacoes` (já configurada via `ALTER PUBLICATION supabase_realtime ADD TABLE …` na Fase 5; pra outras tabelas, repetir no SQL Editor ou no Dashboard → Database → Replication).

#### Cores de status

Mapping em `src/components/leads/status-badge.tsx`. Ajustes na Fase 6 se quiser bater 100% com Notion atual.

### SLA + alertas + sino (Fase 6)

**Engine** em [`src/lib/sla/`](src/lib/sla/):
- `check.ts` — `checkSlaPrimeiroContato(now?)`: avalia leads candidatos (status `novo`, `consultor_id` setado, `MAX(atribuidoEm, última interação manual) ≤ NOW() - 30min`); skip se `now` fora de 08-18 BRT seg-sex; idempotente
- `check.ts` — `resolveSlaAlertsForLead(leadId)`: marca todos os SLA ativos do lead como resolvidos
- `notify.ts` — `sendSlaAlertEmail(novos)` envia 1 email pra todos os admins com a lista agrupada

**Cron** `/api/cron/sla-check` (GET, schedule `*/5 * * * *` em [`vercel.json`](vercel.json)):
- Em prod valida `Authorization: Bearer ${CRON_SECRET}` (Vercel injeta automaticamente)
- Em dev (`NODE_ENV != production`) aceita sem auth — testa via `curl http://localhost:3000/api/cron/sla-check`

**`/api/sla/alertas`** (GET): alertas ativos com info do lead. Scope por perfil (admin/gerente todos, consultor só próprios, marketing bloqueado).

**Sino in-app** ([`<NotificationsBell>`](src/components/shared/notifications-bell.tsx)) no header:
- Badge vermelho com count
- Dropdown listando alertas com link
- Subscribe a `sla_alertas` via Realtime → toast no novo + refetch

**Badge SLA na lista e Kanban**: `listLeads` agora retorna `slaAtrasado: boolean`; lista mostra ⚠️ ao lado do nome, kanban borda + ring vermelho no card.

**Auto-resolve**: `POST /api/leads/[id]/interacoes` chama `resolveSlaAlertsForLead` quando interação é manual. Audit log inclui `slaResolved: N`.

**Realtime**: replication habilitada para `public.sla_alertas` via `ALTER PUBLICATION supabase_realtime`.

### Templates de mensagens (Fase 6)

**UI** em [`/configuracoes/mensagens`](src/app/(app)/configuracoes/mensagens/page.tsx) (admin only):
- Lista ordenada por `ordem`, drag-and-drop pra reordenar (dnd-kit)
- Toggle ativo, editar, excluir (confirmação inline)
- Dialog de criar/editar com nome, status aplicáveis (multi-checkbox), conteúdo (textarea), toggle ativa, botão **"Visualizar com lead exemplo"** (preview com Maria Silva, R$ 350k, Blumenau/SC)

**APIs** (admin only):
- `GET/POST /api/configuracoes/mensagens`
- `PATCH/DELETE /api/configuracoes/mensagens/[id]`
- `POST /api/configuracoes/mensagens/reorder`

**`renderTemplate`** extraído pra [`src/lib/templates.ts`](src/lib/templates.ts) — usado tanto no preview do Dialog quanto em `<MensagensSugeridas>` do detalhe.

**Auditoria** novas: `template_criado/editado/excluido/reordenados`, `sla_alertas_disparados`.

### Tabela auxiliar `webhook_idempotency`

- Schema: `id`, `payload_hash UNIQUE`, `lead_id` (FK leads), `created_at`
- RLS habilitada sem policies → só `service_role` acessa (backend)
- Cleanup de rows antigas: TODO Fase 4 (`/api/cron/cleanup-idempotency`)

### UI

- `/leads/novo` (admin/gerente/consultor): form com seções Pessoais / Contato / Operação / Origem-atribuição. RHF + Zod, conversão de R$ → centavos no submit. Consultor não vê o select de atribuição.
- `/leads`, `/leads/kanban`, `/leads/[id]`: ainda placeholders — visualizações entram na Fase 4.

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
