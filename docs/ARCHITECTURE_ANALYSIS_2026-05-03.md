# Analise de arquitetura — credios-crm

Data da analise: 2026-05-03  
Escopo: leitura estatica do repositorio, documentacao local, schema/migrations, rotas Next.js, servicos de dominio, componentes principais, testes e build.

## Sumario executivo

O `credios-crm` esta em um estado arquitetural bom para um CRM interno de pequeno time com ambicao de crescer: ha separacao clara entre rotas Next.js, componentes por area, modulos de dominio em `src/lib`, validacao com Zod, persistencia tipada com Drizzle, RLS no Supabase, auditoria, MFA, roteamento configuravel, tarefas, SLA, realtime e relatorios pre-agregados por materialized views.

O projeto ja saiu do "CRUD simples". A arquitetura atual e um **modular monolith server-centric em Next.js App Router**, com backend co-localizado em route handlers/server components, banco Postgres/Supabase como centro do dominio, e algumas subarquiteturas bem definidas: routing engine com DI, relatorios com cache/MVs, tarefas por cron, SLA set-based e camada de permissao em app-layer.

O ponto mais importante: a base esta saudavel, mas algumas invariantes criticas ainda dependem de convencao e UI, nao de uma camada unica de dominio. Isso aparece em status dinamicos, atribuicao manual, idempotencia do webhook, caches de configuracao e metricas historicas de consultor. Para ganhar eficiencia e escala sem perder velocidade, o proximo salto nao e trocar stack; e **centralizar invariantes e contratos de dominio** em servicos transacionais e testes de integracao.

## Evidencias de saude

- `npm test`: 6 arquivos, 105 testes, todos passando.
- `npm run lint`: passou sem erros.
- `npx tsc --noEmit`: passou sem erros.
- `npm run build`: passou em Next.js 16.2.4 com Turbopack.
- Tamanho aproximado: 268 arquivos TS/TSX em `src/db/tests`, 26 pages, 36 route handlers, 11 migrations SQL, 86 diretivas `"use client"`, 22 usos de `unstable_cache`, 22 ocorrencias de `sql.raw`.
- Maiores hotspots por LOC: `src/lib/reports/queries.ts` (2257 linhas), `status-config-list.tsx` (752), `lead-kanban.tsx` (717), `lead-bulk-actions.tsx` (641), `tarefas-page-client.tsx` (617), `lead-detail-header.tsx` (611).

## Arquitetura atual

### Estilo arquitetural

A arquitetura e um monolito modular:

- **Interface e routing**: Next.js 16 App Router em `src/app`, com grupos `(auth)` e `(app)`, server components para telas autenticadas e client components para interacao rica.
- **Backend HTTP**: route handlers em `src/app/api/**/route.ts`.
- **Dominio compartilhado**: servicos e queries em `src/lib/**`.
- **Persistencia**: Postgres Supabase via Drizzle e `postgres-js`; migrations em `db/migrations`; policies/triggers em `db/policies.sql`.
- **Auth e seguranca**: Supabase Auth, MFA TOTP para admin, proxy Next 16 em `src/proxy.ts`, permissions app-layer em `src/lib/auth/permissions.ts`, RLS como defesa adicional para acesso client/direct.
- **Realtime**: Supabase Realtime nos hooks `src/lib/realtime/*`.
- **Automacoes**: Vercel Cron em `vercel.json` para SLA, tarefas diarias, tarefas atrasadas e refresh de materialized views.
- **Observabilidade funcional**: `audit_log`, logs de eventos sensiveis e emails transacionais.

### Principais modulos de dominio

| Area | Arquivos principais | Papel |
|---|---|---|
| Auth/permissao | `src/lib/auth/*`, `src/proxy.ts`, layouts `(app)` | Sessao Supabase, perfil app, MFA, gating e matriz de permissoes |
| Leads | `src/lib/leads/*`, `src/app/api/leads/**`, `src/components/leads/*` | Listagem, kanban, detalhe, status, interacoes, bancos, bulk actions |
| Webhook | `src/app/api/webhooks/lead/route.ts` | Ingestao publica, idempotencia, normalizacao, routing, duplicidade, audit/email |
| Routing | `src/lib/routing/*` | Engine testavel por DI, condicoes, round-robin com lock pessimista |
| Status configuravel | `db/schema.ts`, `src/lib/status/*`, `src/app/api/configuracoes/status/**` | Funil editavel pelo admin, cascata de leads ao remover/desativar status |
| Tarefas | `src/lib/tasks/*`, `src/app/api/cron/tarefas-*`, `src/app/api/tarefas/**` | Follow-up diario por status, conclusao e emails |
| SLA | `src/lib/sla/*`, `src/app/api/cron/sla-check/route.ts` | SLA de primeiro contato com query set-based e alerta idempotente |
| Relatorios | `src/lib/reports/*`, `db/views.ts`, `db/migrations/0010_materialized_views.sql` | KPIs, dashboards, comparativos, MVs e cache |
| Auditoria | `src/lib/audit.ts`, `src/app/(app)/audit`, `src/app/api/audit` | Trilha LGPD e consulta admin |

## O que esta bem feito

1. **Escolha de stack coerente**: Next.js App Router + Supabase + Drizzle faz sentido para CRM interno com equipe pequena, pouco overhead operacional e alto ganho de velocidade.

2. **Server-centric por padrao**: boa parte das telas busca dados no server e so hidrata partes realmente interativas. Isso reduz client JS e simplifica seguranca.

3. **Permissoes explicitas**: `checkPermission` e perfis (`admin`, `gerente`, `consultor`, `marketing`) deixam as regras legiveis. Marketing recebe mascaramento server-side, e timeline/interacoes sao bloqueadas para evitar PII em texto livre.

4. **Routing engine com DI**: `src/lib/routing/engine.ts` e testes mostram uma decisao excelente. A regra de negocio e pura/testavel, e o round-robin usa `SELECT ... FOR UPDATE`.

5. **Relatorios ja pensados para escala**: ha `unstable_cache`, `React.cache`, Suspense por secao, MVs (`mv_leads_diarios`, `mv_fechados_diarios`) e refresh cron. Isso e sofisticado e apropriado para dashboards.

6. **SLA set-based**: a checagem de SLA evita N+1, usa indices parciais e `ON CONFLICT` com indice unico parcial para idempotencia.

7. **Boas praticas LGPD**: audit trail, mascaramento de marketing, MFA para admin, safe redirect no login/callback e restricoes de financeiro para nao-admin.

8. **Build/test/lint verdes**: importante porque a base ja e grande; o projeto compila hoje.

## Achados tecnicos e riscos

### P1 — Webhook pode criar lead duplicado em falha parcial

Arquivo: `src/app/api/webhooks/lead/route.ts`

O bloco protegido do webhook faz `insert(leads)`, depois atualiza a claim de idempotencia, depois insere duplicidade e interacao. Se qualquer passo posterior ao insert do lead falhar, o `catch` apaga a claim e retorna `retryable: true`. Como nao ha transacao envolvendo esses writes, o lead ja criado permanece no banco. Um retry imediato pode criar outro lead identico.

Trecho relevante: linhas 147-218 criam lead/claim/interacao; linhas 219-231 deletam a claim no catch.

Impacto: duplicidade em uma das entradas mais importantes do CRM, especialmente sob falhas intermitentes de DB ou constraints futuras.

Recomendacao: mover lead + claim update + duplicidade + interacao para `db.transaction`. Em falha antes do commit, rollback total. Em falha apos commit, manter claim apontando para lead. O email/audit continuam em `after()`.

### P1/P2 — Endpoint de status aceita status inexistente

Arquivos:

- `src/lib/validators/lead.ts`
- `src/app/api/leads/[id]/status/route.ts`

O validator comenta que qualquer key snake_case e aceita e que a validacao contra o banco fica no endpoint. Mas o endpoint atual nao consulta `status_lead_config`; ele grava `data.status` diretamente.

Impacto: um usuario autenticado com permissao de mudar status pode gravar um status fantasma via API, quebrando Kanban, filtros, tarefas, relatorios e cascatas.

Recomendacao: antes do update, buscar `status_lead_config` por `key = data.status AND ativo = true`. Rejeitar inexistente/inativo. Idealmente, centralizar `changeLeadStatus()` em `src/lib/leads/service.ts` para UI/API/bulk/kanban usarem a mesma invariante.

### P2 — Atribuicao manual permite usuario ativo de perfil inadequado

Arquivo: `src/app/api/leads/[id]/atribuicao/route.ts`

O endpoint valida se o `consultorId` existe e esta ativo, mas nao valida o perfil. Assim, um admin/gerente poderia atribuir lead a um usuario `marketing` se chamar a API diretamente.

Impacto: quebra a matriz de permissao e pode expor leads para um perfil que deveria ver apenas dados mascarados/relatorios.

Recomendacao: validar `perfil IN ('admin','gerente','consultor')` no endpoint, como ja ocorre em `realRoutingDeps.listAssignableUserIds()` e nas listas de consultores.

### P2 — Historico de atribuicao e KPI por consultor estao inconsistentes

Arquivos:

- `src/app/api/leads/[id]/atribuicao/route.ts`
- `src/lib/reports/queries.ts`

O KPI por consultor documenta que um lead movido para outro consultor continua no historico do consultor original porque `atribuido_em` seria preservado. Mas a rota de atribuicao sobrescreve `consultorId`, `atribuidoEm` e `atribuidoPor` a cada mudanca.

Impacto: metricas historicas de desempenho podem mudar retroativamente quando um lead e reatribuido. Isso afeta comissao gerencial, accountability e analises de produtividade.

Recomendacao: introduzir `lead_assignment_history` ou derivar historico de `interacoes.tipo='mudanca_atribuicao'`. Separar `consultor_id_atual` de eventos historicos. Ajustar KPIs para periodo de posse real ou primeira atribuicao, conforme regra de negocio.

### P2 — Materialized views concedidas para `anon`

Arquivo: `db/migrations/0010_materialized_views.sql`

As MVs de relatorios recebem `GRANT SELECT ... TO authenticated, anon, service_role`. Como a anon key do Supabase e publica no frontend, isso pode expor agregados de negocio via API Supabase, mesmo que nao tenha PII nominal.

Impacto: vazamento de inteligencia comercial: volume por origem, status, estado, consultor_id, valores buscados/liberados/comissao agregados.

Recomendacao: remover `anon`. Avaliar se `authenticated` tambem e amplo demais; se as queries sao server-side via Drizzle, talvez nenhuma role client precise ler as MVs. Para acesso client direto, criar views/functions com controle por perfil.

### P2 — Redirect de MFA nao sanitiza `next`

Arquivos:

- `src/app/(auth)/desafio-mfa/page.tsx`
- `src/components/auth/mfa-challenge-form.tsx`

Login e callback usam `safeNext`, mas MFA usa `next ?? "/leads"` diretamente no server redirect e no `router.push`. Isso reabre uma classe de open redirect que o projeto ja resolveu em outros fluxos.

Impacto: phishing/redirect externo apos MFA, dependendo de como Next/browser tratam valores como `//evil.com` ou URLs absolutas.

Recomendacao: aplicar `safeNext` na page e passar apenas o valor sanitizado ao client component.

### P2 — Cache de status/config nao e invalidado em mutacoes

Arquivos:

- `src/lib/status/queries.ts`
- `src/app/api/configuracoes/status/**`

`listAllStatuses` e `listActiveStatuses` usam `unstable_cache` com tag `status:config` e TTL de 300s, mas as rotas de criar/editar/reordenar/excluir status nao chamam `revalidateTag("status:config")`.

Impacto: Kanban, dropdowns e labels podem ficar com status antigo por ate 5 minutos apos o admin alterar funil. Para um CRM operacional, isso parece bug de UX.

Recomendacao: chamar `revalidateTag("status:config")` em todas as mutacoes de status. Fazer o mesmo para caches de tarefas/relatorios quando mutacoes impactarem dashboards.

### P2/P3 — Logs de auditoria fire-and-forget em eventos sensiveis

Arquivos:

- `src/app/auth/logout/route.ts`
- `src/app/api/configuracoes/usuarios/**`
- varias rotas admin de configuracao

Alguns eventos usam `void logAction`/`void logAudit`. Em runtime serverless, promises nao aguardadas podem ser interrompidas. O proprio projeto ja usa `after()` em outras rotas por esse motivo.

Impacto: lacunas em trilha LGPD justamente em logout, convite/edicao/reset/exclusao de usuario e configuracoes admin.

Recomendacao: padronizar: eventos criticos `await`; eventos nao criticos `after(() => logAction(...))`; evitar `void logAction` em route handlers.

### P3 — `src/lib/reports/queries.ts` virou modulo concentrador

Arquivo: `src/lib/reports/queries.ts`

Com 2257 linhas, ele concentra KPIs, MVs, raw SQL, filtros, distribuicoes, percentis, comparativos e queries pessoais/globais. Funciona, mas aumenta custo cognitivo e risco de regressao.

Recomendacao: fatiar por subdominio sem mudar API publica:

- `reports/filters.ts`
- `reports/kpis.ts`
- `reports/mvs.ts`
- `reports/performance.ts`
- `reports/distributions.ts`
- `reports/time-metrics.ts`
- `reports/executive.ts`

Manter `queries.ts` como facade temporaria para reduzir churn.

### P3 — Raw SQL interpolado demais

Ha 22 ocorrencias de `sql.raw`. Muitas entradas passam por Zod e escaping manual de aspas, entao nao vi um exploit direto evidente; ainda assim, para software financeiro/CRM, o ideal e reduzir interpolacao textual.

Riscos:

- seguranca: escaping manual e facil de errar em alteracoes futuras;
- observabilidade: SQL grande em string dificulta teste isolado;
- manutencao: filtros duplicados entre Drizzle builder e SQL raw.

Recomendacao: usar `sql``...${param}` sempre que possivel; quando precisar SQL dinamico, montar listas com helpers parametrizados ou whitelists estritas. Para queries muito complexas, considerar views/functions SQL versionadas em migrations.

### P3 — Status dinamicos e status sistema ainda estao acoplados

O modelo de status configuravel e bom, mas ainda ha varios lugares com keys sistema hard-coded (`fechado`, `documentacao_enviada`, `em_negociacao`, etc.). Isso e inevitavel para regras especiais, mas hoje o admin pode excluir status sistema e tornar esses fluxos inertes.

Riscos:

- excluir `fechado` remove o caminho normal de fechamento;
- custom status terminal pode nao ser tratado por todos os contadores;
- telas novas podem usar labels estaticas (`STATUS_LEAD_LABEL`) e ignorar `status_lead_config`.

Recomendacao: preservar status sistema como rows nao deletaveis; permitir apenas desativar/renomear/reordenar com warnings. Expor helper central `getStatusSemantics(key)` com `isTerminal`, `requiresCloseFields`, `requiresBanks`, `canDelete`, `canDisable`.

### P3 — Documentacao e migrations/policies divergem

`docs/ARCHITECTURE.md` e `README.md` ainda mencionam a view `leads_marketing`, enquanto `db/migrations/0009_security_advisor_fixes.sql` a remove. `db/policies.sql` ainda recria a view e tambem contem constraints/indices que nao estao em migrations Drizzle.

Impacto: onboarding e deploy ficam sujeitos a ordem manual e drift entre ambientes.

Recomendacao: mover constraints/indices idempotentes para migrations versionadas sempre que possivel; deixar `policies.sql` apenas para policies/triggers que realmente precisam desse caminho. Atualizar docs para o estado real: mascaramento em app-layer, view removida ou recriada com novo padrao.

### P3 — Cobertura de testes ainda e estreita

Os testes atuais cobrem bem funcoes puras e permissoes: routing, mascaramento, CPF/CNPJ, BRT, tasks, `safeNext`. Faltam testes de integracao para fluxos que mais importam:

- webhook idempotente com falha parcial;
- status inexistente/inativo;
- atribuicao para perfil marketing;
- permissoes reais em route handlers;
- caches/revalidacao de status;
- auditoria com `after`/await;
- relatorios apos reatribuicao.

Recomendacao: criar uma camada de testes de servicos com DB transacional local ou Supabase test project. Nao precisa E2E pesado para tudo; 10-15 testes de integracao pegariam os maiores riscos.

### P3 — Componentes interativos grandes

Alguns client components estao grandes e concentram UI + regra + fetch:

- `components/leads/lead-kanban.tsx` (717 linhas)
- `components/leads/lead-bulk-actions.tsx` (641)
- `components/tarefas/tarefas-page-client.tsx` (617)
- `components/leads/lead-detail-header.tsx` (611)
- `components/configuracoes/status-config-list.tsx` (752)

Recomendacao: extrair hooks e subcomponentes por fluxo, nao por estetica. Exemplos: `useKanbanMoveLead`, `useBulkLeadActions`, `StatusDeleteDialog`, `StatusReorderList`, `TaskCompletionDialog`.

### P3 — Arquivo duplicado/ruido de worktree

Existe `src/components/shared/command-palette-loader 2.tsx`, provavelmente copia acidental. Nao e bug de runtime se nao importado, mas e ruido para manutencao.

Recomendacao: remover copia acidental quando a equipe confirmar que nao e usada; evitar nomes com espaco em arquivos TSX.

## Avaliacao por atributo

### Eficiencia/performance

Nota: boa.

Pontos fortes:

- queries de relatorio com cache TTL;
- MVs para agregados frequentes;
- Suspense por secao em dashboards pesados;
- pool Postgres ajustado para HMR/dev e prod;
- indices parciais para fechados, atribuicao e interacoes manuais;
- SLA set-based;
- Kanban com cap defensivo de 500.

Melhorias:

- invalidacao de cache apos mutacoes relevantes;
- consolidar raw SQL e filtros duplicados;
- considerar keyset pagination para listas grandes;
- criar job de limpeza/retencao para idempotencia/audit conforme docs;
- acompanhar EXPLAIN ANALYZE em queries raw principais quando volume real crescer.

### Qualidade/manutenibilidade

Nota: boa, com hotspots claros.

Pontos fortes:

- TypeScript strict;
- Zod schemas;
- modulos de dominio em `src/lib`;
- comentarios tecnicos bons;
- testes existentes de regras puras.

Melhorias:

- reduzir God modules;
- transformar route handlers grandes em chamadas a servicos de dominio;
- mover invariantes para transacoes/servicos;
- atualizar docs para estado real;
- aumentar testes de integracao.

### Escalabilidade

Nota: adequada para curto/medio prazo.

Para 8-10 usuarios internos e milhares/dezenas de milhares de leads, a arquitetura deve aguentar bem. O gargalo mais provavel nao e Next ou Supabase, mas:

- conexoes/latencia em serverless se muitos dashboards pesados abrirem juntos;
- MVs defasadas e refresh concurrent em volume alto;
- relatorios raw com scans/joins laterais;
- ausencia de historico formal de atribuicao;
- permissao app-layer incompleta em algum endpoint direto.

### Seguranca/LGPD

Nota: boa base, alguns ajustes importantes.

Pontos fortes:

- MFA admin;
- safe redirect em login/callback;
- audit log;
- masking de marketing;
- timeline bloqueada para marketing;
- financeiro visivel apenas a admin.

Melhorias:

- remover grant `anon` das MVs;
- sanitizar MFA `next`;
- garantir audit com await/after;
- validar perfil em atribuicao manual;
- validar status ativo/existente no endpoint;
- revisar exposicao de dados agregados a roles Supabase.

## Roadmap recomendado

### Sprint 1 — Correcoes de risco

1. Tornar webhook transacional.
2. Validar status ativo/existente em `PATCH /api/leads/[id]/status`.
3. Bloquear atribuicao manual para perfil fora de admin/gerente/consultor.
4. Remover `anon` das MVs e revisar grants.
5. Aplicar `safeNext` em MFA.
6. Trocar `void logAction` sensivel por `after` ou `await`.
7. Adicionar testes para os seis pontos acima.

### Sprint 2 — Invariantes de dominio

1. Criar `src/lib/leads/service.ts` com:
   - `createLeadFromWebhook`
   - `createLeadManual`
   - `changeLeadStatus`
   - `assignLead`
   - `addInteraction`
2. Fazer route handlers chamarem esses servicos.
3. Centralizar semantica de status em helper unico.
4. Criar historico de atribuicao ou usar eventos para metricas historicas.

### Sprint 3 — Performance e relatorios

1. Fatiar `reports/queries.ts`.
2. Parametrizar/substituir SQL raw mais sensivel.
3. Adicionar smoke tests de queries principais.
4. Revisar invalidacao de caches (`reports:dashboards`, `tasks:dashboards`, `status:config`).
5. Definir SLO de dashboards: p95, cache hit rate, tempo de refresh das MVs.

### Sprint 4 — Operacao e governanca

1. Atualizar `docs/ARCHITECTURE.md`, `README.md` e runbook para refletir MVs, masking atual e grants.
2. Mover constraints/indices de `policies.sql` para migrations onde possivel.
3. Criar checklist de deploy DB: migrations, policies, cron, grants, RLS advisor.
4. Adicionar monitoramento/alertas: cron failures, email failures, webhook 5xx, pool errors.
5. Definir retencao de audit log e cleanup de idempotency.

## Veredito

A base esta boa. O CRM ja tem sinais de engenharia madura: dominio parcialmente modularizado, cache/streaming/MVs em relatorios, engine de roteamento testavel, cuidado com LGPD e build limpo.

As melhorias mais importantes agora nao sao "grandes refactors" nem troca de tecnologia. Sao ajustes cirurgicos para transformar boas convencoes em garantias:

- transacoes onde o dominio exige atomicidade;
- validacao server-side de toda invariante que hoje a UI respeita;
- historico formal para metricas;
- cache invalidado por evento;
- grants/RLS alinhados ao modelo de seguranca;
- testes de integracao para os fluxos que movem dinheiro, leads e permissoes.

Se esses pontos forem tratados, a arquitetura fica bem posicionada para crescer com velocidade sem acumular risco invisivel.
