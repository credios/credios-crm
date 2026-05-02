# Arquitetura — CRM Credios

Resumo das decisões técnicas e por que foram tomadas. Briefing vinculante: [`CLAUDE.md`](../CLAUDE.md).

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | Next.js 16 (App Router) | RSC + server actions pra menos client JS; proxy edge pra auth. CLAUDE.md fixou 15.x mas `create-next-app@latest` instalou 16; mantido por compat (App Router patterns são iguais). |
| Linguagem | TypeScript strict | Pegando bugs de tipo cedo |
| Styling | Tailwind 4 + shadcn `base-nova` | Tailwind 4 nativo no Next 16; shadcn `base-nova` usa `@base-ui/react` (Radix-team novo) — note que `Button render={<Link>}` precisa `nativeButton={false}` |
| Banco | Supabase (Postgres) | RLS nativa, Auth incluso, Realtime via WebSocket, Storage pronto |
| ORM | Drizzle | Migrations versionadas, type-safe queries, tem fallback raw SQL pra agregações complexas |
| Validation | Zod | Schemas compartilhados entre forms e API |
| Email | Resend | Já usado pela Credios |
| Tests | Vitest | Roda fora do Next, não depende de build |
| Cron | Vercel Cron (`vercel.json`) | Built-in da plataforma |

## Estrutura de pastas

Documentado em §8 do [`CLAUDE.md`](../CLAUDE.md). Resumo:

```
src/
├── app/                        # Next App Router
│   ├── (auth)/                 # login, recuperar-senha, primeiro-acesso, desafio-mfa
│   ├── (app)/                  # área autenticada com sidebar
│   ├── auth/                   # callback + logout (route handlers)
│   └── api/                    # API routes
│       ├── webhooks/lead/      # ingestão pública
│       ├── leads/              # CRUD
│       ├── configuracoes/      # admin (roteamento, mensagens, usuarios)
│       ├── audit/              # admin
│       ├── sla/                # bell de notificações
│       └── cron/sla-check/     # Vercel Cron
├── components/
│   ├── ui/                     # shadcn primitives
│   ├── leads/ relatorios/ configuracoes/ audit/ shared/ auth/
├── lib/
│   ├── supabase/               # client/server/middleware
│   ├── auth/                   # get-app-user, permissions, mascaramento, types
│   ├── routing/                # engine + DI (testável)
│   ├── reports/                # queries agregadas + comparativos.ts + period.ts
│   ├── sla/                    # check + notify
│   ├── leads/                  # listLeads compartilhado
│   ├── formatters/             # currency, date, phone
│   ├── notifications/          # email Resend
│   ├── validators/             # Zod schemas
│   ├── audit.ts horario-comercial.ts templates.ts csv.ts
│   └── db.ts utils.ts
├── proxy.ts                    # Next 16: rename de middleware.ts
db/
├── schema.ts migrations/ seed.ts policies.sql apply-policies.ts
tests/
└── routing-engine.test.ts      # 22 casos com DI mockada
```

## Auth

Stack: Supabase Auth (Google OAuth + email/senha) + MFA TOTP + RLS Postgres.

### Fluxo de login

1. `/login` → `signInWithOAuth({provider:'google', redirectTo:'/auth/callback'})` ou `signInWithPassword`
2. Supabase processa, redireciona pra `/auth/callback?code=...`
3. Route handler chama `exchangeCodeForSession(code)` + `logAction(login)`
4. Redirect pra `/leads`
5. `(app)/layout.tsx` server component faz gates:
   - `getAppUser()` — null → `/login`
   - `!ativo` → `/sem-permissao`
   - `!nome` → `/primeiro-acesso`
   - admin sem MFA verificado → `/primeiro-acesso` (enrolment forçado)
   - admin com MFA mas sessão AAL1 → `/desafio-mfa`

### Trigger `on_auth_user_created`

Em `db/policies.sql`. Quando alguém loga via Google com email novo, Supabase cria `auth.users`. Trigger insere row correspondente em `public.users` com `perfil='consultor'` (default seguro). Admin promove via `/configuracoes/usuarios` depois.

Sem o trigger: `getAppUser()` retorna null → loop de redirect entre `/login` e `/leads`. Bug acontecido na primeira vez que Gabriel logou via Google (email do Workspace `gabriel.meirelles@` ≠ `gabriel@` do seed); fix permanente.

### Permissions

`src/lib/auth/permissions.ts` exporta `checkPermission(user, action, resource?)`. Usado nas API routes pra gate (RLS é a defesa em profundidade no DB).

Matriz em [`CLAUDE.md` §5](../CLAUDE.md). Marketing tem mascaramento PII server-side via `src/lib/auth/mascaramento.ts`.

## Routing engine

`src/lib/routing/`:

- `types.ts` — `RoutingRule`, `RoutingContext`, `RoutingDeps`
- `conditions.ts` — `matchesConditions(ctx, conds)` puro (testável)
- `engine.ts` — `aplicarRoteamento(ctx, deps, options?)` recebe `deps` por DI
- `round-robin.ts` — `pickNextRoundRobin` com transação `SELECT ... FOR UPDATE` (anti-race)
- `db-deps.ts` — `realRoutingDeps` (produção)

Engine é stateless e DI permite mock em tests sem tocar Postgres. 22 testes em `tests/routing-engine.test.ts`.

UI admin em `/configuracoes/roteamento`: list com dnd-kit, editor de condições dinâmico (Add/Remove com checkboxes pra UFs/origens/tipos), tester com dry-run.

## Webhook + Idempotência

`POST /api/webhooks/lead`:
- Validação `x-webhook-secret` timing-safe
- Zod schema com `passthrough` (preserva extras em `raw_payload`)
- SHA256 das top-level keys ordenadas + janela 60s via tabela `webhook_idempotency`
- CPF duplicado: cria lead + row em `duplicidades_pendentes` (não bloqueia)
- Engine de roteamento → atribui ou pool
- Resend email pra admins se `foraHorarioComercial()` (08-18 BRT seg-sex)

`webhook_idempotency` tem RLS habilitada sem policies (só service_role). Cleanup de rows antigas: TODO Fase 9.

## SLA

`src/lib/sla/check.ts`:
- Candidato = status `novo` + `consultor_id` setado + `MAX(atribuidoEm, última_interação_manual) ≤ now-30min`
- Cron `*/5 * * * *` em `vercel.json` → `/api/cron/sla-check`
- Em prod: valida `Authorization: Bearer ${CRON_SECRET}`. Em dev: aceita sem auth pra curl
- Auto-resolve em `POST /api/leads/[id]/interacoes` quando interação é manual
- Sino `<NotificationsBell>` no header com Realtime + toast no novo

## Relatórios — 3 páginas com escopos distintos

Após a refatoração, relatórios são divididos em três rotas com permissões específicas:

| Rota | Acesso | Foco |
|---|---|---|
| `/meu-desempenho` | Todos logados (consultor sempre vê o próprio; admin/gerente trocam via `<ConsultorPicker>`) | Visão pessoal: KPIs com comparativo, saúde do pipeline pessoal (esfriando, SLA, aguardando ação), funil pessoal, performance por origem, histórico de fechamentos |
| `/relatorios` | admin, gerente, marketing | Visão consolidada operacional: KPIs com delta, funil global, volume por dia, mix de origens, performance por consultor (não p/ marketing) e por UF, motivos de perda, saúde operacional |
| `/admin/painel-executivo` | admin only (`isAdmin(user)` + redirect) | Visão estratégica em R$: KPIs hero com sparklines, receita 12m com dual-axis, projeção do mês, pipeline em R$, percentis P25/P50/P75/P90, comparativo de períodos, top 10 origens detalhadas |

**Filtros** (`reportFiltersSchema` em `src/lib/validators/report.ts`):
- Multi-select (CSV em URL): `consultorIds`, `origens`, `ufs`
- Range numérico: `valorMinCentavos / valorMaxCentavos`
- Presets: `hoje | 7d | 30d | 90d | mes_atual | mes_anterior | trimestre | ano | ultimos_12m | custom`
- Modo de comparação (página executiva): `anterior_equivalente | ano_passado | sem`
- Backward-compat: aceita `consultorId` e `origem` single, mescla via `normalizeFilters()`

**Período de comparação** (`src/lib/reports/comparativos.ts`):
- `previousPeriod(p)` — anterior equivalente; se `mes_atual` retorna mês anterior, se `30d` retorna 30d anteriores
- `samePeriodLastYear(p)` — mesma janela 1 ano atrás
- `pctDelta(curr, prev)` e `pointsDelta` — null-safe (prev=0 retorna null, exceto ambos zero)

**Mascaramento financeiro**: `shouldMaskFinancial(perfil) === perfil !== "admin"` em `src/lib/auth/mascaramento.ts`. Aplicado server-side em `OrigemROITable`, `PerformanceUfTable`, `HistoricoFechamentos` via prop `hideValor`. Páginas /relatorios e /meu-desempenho NÃO mostram banco/valor liberado/comissão pra gerente, consultor ou marketing.

**Auditoria**: cada page server component chama `logAction(null, user.id, "relatorio_acessado", "relatorio", null, { tipo, ... })`. Tipos: `meu_desempenho | gerencial | executivo`.

**Componentes em `src/components/relatorios/`**:
- `kpi-card.tsx` — KPI padrão (deltaPct opcional)
- `kpi-executive.tsx` — KPI hero com sparkline (painel exec)
- `sparkline.tsx` — SVG inline puro (sem dep), usado em KPIs exec
- `consultor-picker.tsx` — admin/gerente troca consultor visualizado em /meu-desempenho
- `desempenho-filters.tsx` — filtros enxutos (período + origem multi)
- `report-filters.tsx` — filtros completos (período + multi consultor/origem/UF + range valor)
- `exec-filters.tsx` — só período + modo comparação
- `saude-cards.tsx` — 3 cards Esfriando/SLA/AguardandoAção com cor por threshold
- `historico-fechamentos.tsx` — tabela detalhada do período (admin only via hideValor)
- `comparativo-periodos.tsx` — 8 métricas × atual/anterior/Δ% com seta
- `pipeline-em-reais.tsx` — barras horizontais por status × R$ buscado
- `projecao-mes.tsx` — comissão fechada + (em_negociacao × win_rate × comissão média)
- `percentis-tempo.tsx` — tabela P25/P50/P75/P90 entre milestones
- `top-origens.tsx` — top 10 (origem + utm_source + utm_campaign)
- `charts/` — Recharts wrappers (`receita-mensal-exec` usa dual-axis)

## Realtime

Replication habilitada em `public.leads`, `public.interacoes`, `public.sla_alertas` via `ALTER PUBLICATION supabase_realtime ADD TABLE`.

Hooks em `src/lib/realtime/`:
- `useLeadsRealtime()` — debounce 400ms → `router.refresh()`
- `useInteracoesRealtime(leadId, onNew)` — append direto na timeline

RLS aplica via JWT do user — consultor recebe events só dos próprios leads.

## Mascaramento Marketing

§5 do CLAUDE.md exige PII mascarada pra perfil marketing:
- CPF: `***.***.***-XX`
- Email: `***@dominio.com`
- WhatsApp: `null`
- Renda: faixa em vez de valor exato
- Dados financeiros (banco, valor liberado, comissão): `null`

Implementado em `src/lib/auth/mascaramento.ts` aplicado server-side em listLeads e detalhe. View `leads_marketing` no Postgres faz o mesmo masking pra acesso SQL direto.

Relatórios: marketing não vê chart Performance por consultor nem Receita mensal; KPIs sem R$.

## Audit

Todas as ações sensíveis chamam `logAudit({ acao, usuarioId, recursoTipo, recursoId, metadata, ip, userAgent })`. Insert via Drizzle (postgres user, BYPASSRLS) — RLS bloqueia INSERT por usuários autenticados.

UI em `/audit` (admin only): tabela com filtros (usuário, ação ilike, recurso_tipo, período) + paginação 50/pág.

Eventos atuais:
- `login`, `logout`, `perfil_editado`, `senha_atualizada`, `mfa_desativado`
- `lead_criado_webhook`, `lead_criado_manual`, `lead_visualizado`, `lead_editado`, `lead_status_mudou`, `lead_atribuido`, `interacao_criada`
- `regra_criada/editada/excluida/reordenadas`
- `template_criado/editado/excluido/reordenados`
- `sla_alertas_disparados`
- `usuario_convidado/editado/mfa_reset`

Retenção: 12 meses no banco (CLAUDE.md §6.11). Fase 10+: archive em storage.

## Trade-offs / TODOs conhecidos

| Item | Status | Quando |
|---|---|---|
| Cleanup `webhook_idempotency` | tabela cresce indefinidamente | TODO cron handler junto com sla-check |
| Inline edit por field | edit por seção apenas | polish futuro |
| Cap 500 leads no Kanban | aviso visual quando atinge | virtualização ou pagination por coluna |
| Tempo médio SLA por consultor | sem filtro de outliers | refinar quando dados reais aparecerem |
| J/K navegação por teclado | skip MVP | nice-to-have |
| Skeleton loaders | usados em poucos componentes | revisar quando perceived perf for problema |
| Sentry / Vercel Analytics | docs only no [`RUNBOOK.md`](./RUNBOOK.md) | ativa quando deployar |
