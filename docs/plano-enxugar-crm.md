# Plano para enxugar o CRM

> Auditoria de 2026-10-28. Nada foi removido: este documento só propõe, e quem decide é o owner.
> Fontes: banco de produção lido **só com SELECT** (sessão `default_transaction_read_only=on`, via pooler), o código em `HEAD` (`ff439de`) e o knip@5 rodado numa cópia limpa (`git archive` + `npm ci`).

## 0. Decisões do owner (2026-10-28)

| # | Decisão | Situação |
|---|---|---|
| C1 | Relatórios atualizam sozinhos **às 9h e às 18h** (Brasília), mais o botão "Atualizar dados" em `/relatorios`. | Feito: janela 9h/18h na chave do cache (`lib/reports/atualizacao.ts`), cron `0 12,21 * * *`, rota `POST /api/relatorios/atualizar`. |
| C4 | Remover o Portal VIP. | Feito: página, componentes, `checklist-vip`, rota `complementos` e exceção no middleware. `conjuge-renda` ficou (é do portal padrão). |
| C5 | Consertar a checagem de duplicidade. | Feito: `registrarDuplicidadeCpf` roda na criação (webhook e manual), no enriquecimento do simulador e na edição. Backfill dos pares antigos em `scripts/backfill-duplicidades-cpf.mts` (19 pares na simulação de 28/10; rodar com `--executar`). |
| C8, C9, C10, C13 | Limpeza sem risco. | Feito: 4 dependências fora, `@dnd-kit/utilities` e `sharp` declarados; código morto do knip; `restore-leads-from-payload`; adapters LinkedIn e TikTok. |
| LGPD | O log de visualização (`lead_visualizado`) **não** será implementado: o CRM é de uso interno exclusivo. | Fechado. |
| Demais (C2, C3, C6, C7, C11, C12, C15, C16) | **Manter** como está. | Fechado. |

## 1. Contexto: leia antes dos números

- **São 3 usuários:** Gabriel (admin), Rodrigo (consultor) e Kaylane (marketing). A última ação da Kaylane no `audit_log` é de **31/08**, e ela não registrou nada nos últimos 58 dias.
- **Set/out foram meses fracos.** A entrada de leads caiu de 184 em agosto para **46 em setembro e 41 em outubro**. Em setembro quase não houve atividade humana: 17 mudanças de status e 1 contato registrado, contra cerca de 300 por mês entre junho e agosto.
  - Por isso, "sem uso há 60 dias" sozinho prova pouco. A evidência forte é a feature que **morreu quando o uso geral ainda era alto** (jun–ago) ou que **nunca pegou**.
- **A maioria das telas não registra visualização.** Só `/relatorios`, `/admin/painel-executivo` e `/meu-desempenho` gravam `relatorio_acessado`. Para Minha Mesa, Kanban, Em negociação, Atividades, Consultores, Leads novos e Google Ads não há medida de acesso. Nesses casos, recomendo **perguntar ao owner**, nunca remover.
- **Tamanho de hoje:** 77,3 mil linhas em `src`, sendo 32,5 mil em components, 24,8 mil em lib e 20,0 mil em app. Há 8 crons, 100 rotas de API e 61 páginas.

## 2. O que está vivo e fica (com números)

Nenhum destes é candidato a remoção. A lista existe para mostrar que foram medidos.

| Feature | Evidência de uso | Observação |
|---|---|---|
| Heloísa (WhatsApp bot) e proativo | 150 mensagens enviadas e 134 recebidas pelo bot em 30 dias; 1.163/1.096 em 90 dias | Decisão do owner (§14). |
| Handoff para o consultor | 106 "Bot cedeu a vez" no total, 10 em 30 dias | — |
| SDR e reuniões | 92 reuniões, 14 criadas em 30 dias (36 realizadas, 35 no-show); 14 desfechos registrados em 30 dias | — |
| Agenda pública no simulador | cerca de 52 "Cliente escolheu o horário", a última em 21/10 | Decisão do owner. |
| Lembrete de reunião (cron 10 min) | 45 lembretes, 7 em 30 dias | — |
| Cadências e cadencia-gc | 27 leads entraram em cadência em 30 dias e 85 em 90 dias; o gc moveu 8 leads para perdido (último em 14/08) | Decisão do owner. |
| Webhook, enriquecimento e tracking | 41 leads criados e 40 enriquecidos em 30 dias | — |
| Portal de documentos do lead | 254 documentos; 38 links gerados em 30 dias; 140 tokens já usados, 9 deles em 30 dias | A curva cai junto com o volume de leads. |
| Proposta em faixa | 58 PDFs, 3 em 30 dias, último em 22/10 | — |
| Negociação bancária (`lead_bancos`) | 110 linhas, última em 23/10 | Em queda: 2 em outubro. |
| Relatórios gerenciais | 13 acessos em 30 dias, 67 em 90 dias | Usados os períodos 30d, 90d, ano e mês anterior. |
| Meu desempenho | Rodrigo: 25 acessos em 90 dias, último em 05/10 | — |
| Alertas de SLA | 136 alertas, 7 em 30 dias | — |
| Parceiros (B2B) | 47 parceiros, 30 interações em 30 dias | — |
| Portal do parceiro, contrato, comissões, simulação de condomínio | 17 contratos migrados; 2 dos 17 usuários do portal já fizeram login; 0 comissões; 0 simulações | Novo, com a virada pendente (§14 Fase 5). É cedo para medir. |
| Condomínio | 1 lead | Novo (2026-10-13). |
| Simulação do fundo | 2 PDFs em 28/10 | Novo; fora de questão. |
| Google Ads offline conversions | 7 conversões (5 enviadas), última em 15/10 | Pouco volume, mas é decisão do owner. |
| Meta CAPI | 107 leads de Meta Ads em 90 dias; 10 com fbclid | — |
| Regras de roteamento | 1 regra ("AR -> Gabriel"), que disparou 22 vezes, a última em 18/09 | §6.4 do MVP. O round-robin **nunca rodou** (`round_robin_estado` vazio), mas faz parte da especificação. |
| Templates de mensagem | 38 templates (30 de CGI, 8 de condomínio) | — |

## 3. Candidatos a enxugar

A coluna "Custo" estima o que se elimina: linhas de código (aproximadas), crons, dependências e risco.

| # | Candidato | Evidência de uso | Custo de manter | Recomendação | Migration? |
|---|---|---|---|---|---|
| **C1** | **Cron `aquecer-relatorios`** (a cada 10 min) | Faz 144 execuções por dia. Cada uma recalcula 8 períodos × cerca de 20 consultas, o que dá **~23 mil consultas por dia**. Do outro lado, há 13 acessos a relatórios em 30 dias, usando 4 períodos; o painel executivo não é aberto desde 13/07. | Carga constante no pooler (a memória `reference_pooler_pipelining_trava` registra que ele trava com consultas empilhadas), tempo de função na Vercel, 110 linhas. | **Reduzir:** aquecer só 30d e 90d, a cada 30–60 min, em horário comercial. **Remover** se o painel executivo sair (C2) e a página carregar em tempo aceitável sem cache. | Não |
| **C2** | **Painel executivo** (`/admin/painel-executivo`) | Último acesso registrado em **13/07/2026**: 107 dias sem uso, apesar de jul/ago terem sido os meses de mais uso. O log é gravado a cada acesso (`page.tsx:99`). Total histórico: 85 acessos, todos do Gabriel, a maioria em maio. | Cerca de 1.300 linhas exclusivas: a página (403) e 8 componentes (`comparativo-periodos`, `exec-filters`, `kpi-executive`, `projecao-mes`, `pipeline-em-reais`, `percentis-tempo`, `top-origens`, `sparkline`), mais as consultas próprias em `lib/reports/queries.ts`. Já causou 504 (comentário no `page.tsx`). Recebeu filtro de produto em 14/10. | **Perguntar ao owner.** Sugestão: esconder do menu primeiro e remover em 30 dias se ninguém sentir falta. O que for útil dali pode ir para `/relatorios`. | Não |
| **C3** | **Visões salvas da lista** (`saved_lead_views`, `/api/lead-views`, `saved-views-menu`) | **1 visão salva desde a criação** (03/06/2026), nenhuma depois. | Cerca de 474 linhas, 2 rotas de API e 1 tabela com RLS. | **Remover** (com o ok do owner). | Sim: dropar `saved_lead_views` **depois de exportar** a linha. |
| **C4** | **Portal VIP** (`/vip/[token]`, `vip-client`, `vip-complementos`, `checklist-vip`, rotas `complementos` e `conjuge-renda`) | **Nenhum botão no CRM gera o link `/vip/`**; só funciona trocando o endereço à mão. O evento `portal_complementos` aparece **1 vez** (15/07/2026). Foi criado em 15/07. | Cerca de 1.050 linhas, 2 rotas públicas (superfície de ataque) e uma exceção no middleware. | **Perguntar ao owner:** se o atendimento premium não se firmou, remover. Atenção: `conjuge-renda` também é usada pelo portal padrão (`portal-client.tsx:61`) e **fica**. Saem a página, os componentes VIP, `checklist-vip` e a rota `complementos` (cerca de 1.000 linhas). | Não |
| **C5** | **Fila de duplicidades** (`/duplicidades`, `duplicidades_pendentes`) | **0 entradas desde 27/05/2026.** Nesse período, **17 leads** chegaram com CPF já existente em outro lead. A detecção só roda na criação (`webhooks/lead/route.ts:914`), mas o simulador manda o CPF na etapa de enriquecimento, então a checagem nunca bate. A tela está sem alimentação. | Cerca de 140 linhas de tela e API, mais o badge. Por si só é barata; o problema é a falsa sensação de controle. | **Perguntar ao owner:** (a) **consertar**, levando a checagem para o enriquecimento (recomendado, porque o §6.2 passo 4 exige), ou (b) remover a tela e assumir que não há revisão. Não é enxugamento puro. | Não. A tabela fica no caso (a). |
| **C6** | **Solicitação de score pelo consultor** (`score_solicitacoes`, `/api/leads/[id]/score/solicitar`, `/api/score/solicitacoes/[id]`) | **1 solicitação desde a criação** (23/07/2026). | Cerca de 200 linhas de API, mais o fluxo de aprovação na UI e 1 tabela. | **Remover** (com o ok do owner). O admin consulta direto e a reunião agendada já dispara a consulta. | Sim: dropar `score_solicitacoes` depois do export. |
| **C7** | **Score QUOD e Cadastro PF automáticos (Direct Data)** | Rodava de 07/07 a **29/08/2026** (198 consultas de score e 186 de cadastro PF) e **parou**. Desde setembro chegaram **55 leads com CPF** e nenhum foi consultado. O código sai calado quando falta `DIRECTD_TOKEN` (`cadastro-pf.ts:62`, `directd.ts:59`) ou quando a API responde erro. Com score `null`, o gate de conversão libera tudo (`scoreLiberaConversao`), então também está inerte: o último `conversao_gate` é de 30/08. | 368 linhas, mais os gates no webhook, na Heloísa e na agenda. Risco: o owner acha que há filtro de score e não há. | **Perguntar ao owner** se a pausa foi intencional (token removido ou créditos acabaram). Se sim, documentar em §14 e esconder o card de score. Se não, reativar. **Não remover:** é decisão de 2026-08-11 (§5). | Não |
| **C8** | **Dependências sem uso** | `google-ads-api` (4,5 MB, nenhum import), `qrcode.react`, `@vitejs/plugin-react` e `@types/pg` (o driver é `postgres`). | Tamanho de `npm ci`, superfície de supply chain e ruído no Dependabot. | **Remover já:** é seguro, verificado por grep. Também **declarar** `@dnd-kit/utilities` e `sharp`, que são importados mas só chegam como dependências transitivas. | Não |
| **C9** | **Código morto apontado pelo knip** | `simulador/simple-simulator.ts`: `buildSimulationResult` e as constantes de IOF antigas, cerca de 150 das 248 linhas (só `iofRatePorTipoPessoa` é usado). `simulador/validator.ts`: `simpleSimulatorSchema`. Cerca de 30 exports nunca referenciados (lista no Apêndice B). `src/app/api/relatorios/` vazio. Diretório vazio `src/lib/kommo/` e variáveis `KOMMO_*` no `.env.local`. | Cerca de 400 linhas, mais confusão: há dois cálculos de IOF, e o oficial é o de `fundo.ts` / `faixa.ts`, conforme o Decreto 12.499. | **Remover** em um PR só de limpeza. | Não |
| **C10** | **Endpoints de incidente** (`/api/admin/restore-leads-from-payload`, 351 linhas) | Restaura os campos apagados pelo bug do PATCH, **corrigido em 06/05/2026**. É ferramenta de uso único. | 351 linhas de rota admin em produção capaz de escrever em lote nos leads. | **Remover:** o histórico do git preserva o código. | Não |
| **C11** | `/api/admin/test-emails` (235 linhas) e `/api/internal/desqualificar-lead` (136 linhas) | Sem medida de uso: as duas rotas são protegidas e não gravam audit. `desqualificar-lead` é chamada por fora (curl com `CRON_SECRET`). | 371 linhas. | **Perguntar ao owner:** manter `desqualificar-lead` se ainda é usada nos casos de concorrente; `test-emails` pode virar script em `scripts/`. | Não |
| **C12** | **Tipos manuais de interação pouco usados** (`ligacao`, `email`, `anotacao`) e **duas formas de anotar** | `ligacao`: 35 no total, a última em 12/08. `email`: 8, a última em 17/07. `anotacao` (tipo da timeline): 4, a última em 24/07. A aba Anotações (`lead_anotacoes`, 80 linhas, a última em 21/09) já cumpre o papel de anotar. O consultor usa `contato` (844) e `whatsapp_enviado`. | Pouco código; o custo é ruído no dropdown e dois lugares para escrever nota. | **Perguntar ao owner:** tirar `ligacao`, `email` e `anotacao` do dropdown, sem remover do CHECK, porque o histórico fica. Manter a aba Anotações. | Não |
| **C13** | **CAPI LinkedIn e TikTok** (`capi/linkedin.ts`, `capi/tiktok.ts`) | **0 leads** com `ttclid`, `li_fat_id` ou utm de TikTok/LinkedIn **em toda a história**. As variáveis não estão no `.env.local` (não deu para conferir a Vercel). O dispatcher devolve `skipped`. | 202 linhas e 6 variáveis de ambiente. | **Remover** os dois adapters e manter Meta. Volta fácil se um dia houver campanha. | Não |
| **C14** | **Integração com o portal antigo** (`notifyPartnerPortal`, card de handoff) | Já planejada no §14 Fase 5: sai 30 dias depois da virada. | 4 chamadas, mais `PORTAL_WEBHOOK_*`. | **Executar conforme o §14** (depende da virada do domínio, pendente do owner). | Não |
| **C15** | **Atividades** (`/atividades`, 1.251 linhas) e **Consultores** (`/admin/consultores`, 385 linhas) | **Sem telemetria.** Com 1 consultor, as duas telas repetem em parte `/meu-desempenho` (o admin já escolhe o consultor ali) e a timeline do lead. | Cerca de 1.640 linhas. | **Perguntar ao owner.** Primeiro, gravar `relatorio_acessado` nelas por 30 dias (uma linha cada) e só então decidir. | Não |
| **C16** | **Cron `google-ads-retry`** (a cada 15 min) | São 7 conversões na história e nenhuma pendente agora. | 96 execuções por dia sem efeito. | **Reduzir** para a cada hora. Opcional e barato. | Não |
| **C17** | **Configurações quase estáticas:** `/configuracoes/tracking` (aliases criados em 12–13/05, fontes editadas pela última vez em 31/07, 28 desconhecidos, 1 em 30 dias) e `/configuracoes/status` (última edição em 30/06) | Pouco uso, mas cumprem o princípio §2.7 (o admin configura pela UI). | Baixo. | **Manter.** | — |

### Achados colaterais (não são enxugamento; viram tarefas próprias)

- **O audit de LGPD de visualização não grava.** `lead_visualizado` aparece **0 vezes** no `audit_log`. O registro só existe no `GET /api/leads/[id]` (`route.ts:72`), e a página do lead lê direto do banco. O §6.11 e o §10 pedem esse log.
- **`login` gravou 10 vezes no total, a última em 31/08.** Ou o evento não é gravado em todo login (Google SSO?), ou a sessão nunca expira. Vale conferir.
- **Os números do C5 e do C7 são bugs ou pausas silenciosas** que o owner provavelmente não conhece.

## 4. Ordem de execução sugerida

**Onda 0 — perguntas ao owner (nenhum código).** Mandar as perguntas de C2, C4, C5, C6, C7, C11, C12 e C15 numa única lista curta.

**Onda 1 — sem risco, sem migration (1 PR):**
1. C8: tirar as 4 dependências e declarar `@dnd-kit/utilities` e `sharp`.
2. C9: remover o código morto do knip, `api/relatorios/` e `lib/kommo/`.
3. C10: remover `restore-leads-from-payload`.
4. C13: remover os adapters LinkedIn e TikTok da CAPI.
5. C1 e C16: diminuir a frequência e os períodos dos crons em `vercel.json` e em `aquecer-relatorios/route.ts`.
6. Medição: gravar `relatorio_acessado` em Atividades, Consultores, Kanban, Minha Mesa, Em negociação e Google Ads, para basear a onda 3.

**Onda 2 — depende das respostas (PRs separados):**
- C5: consertar a detecção de duplicidade no enriquecimento.
- C7: reativar ou documentar a pausa do Direct Data.
- C2: tirar o Painel executivo do `nav-config.ts`. Remover o código 30 dias depois.
- C3, C4, C6, C12: remover o código e a UI. **As tabelas ficam** até a onda 4.

**Onda 3 — com 30 dias de telemetria:** decidir C15 (Atividades e Consultores) e C2 (remoção definitiva).

**Onda 4 — migrations irreversíveis (só depois de backup):**
1. Exportar cada tabela a dropar com `COPY ... TO` (CSV) ou `pg_dump -t <tabela>`, e guardar fora do Supabase.
2. Uma migration por tabela: `DROP TABLE saved_lead_views;` e `DROP TABLE score_solicitacoes;`. Se o C5 virar remoção, também `duplicidades_pendentes`.
3. Tirar as tabelas de `db/schema.ts` no **mesmo** PR da migration. Seguir o fluxo do repo: o Gabriel aplica a migration **antes** do merge (memória `project_multiproduto_parceiros`).
4. Nunca dropar no mesmo deploy em que o código deixa de ler a tabela: primeiro o código sai, depois (em outro deploy) a tabela.

**Checklist ao remover telas ou status:** a memória `project_status_novo_relatorios` lembra que status e relatórios dependem de listas em vários arquivos. Ao remover qualquer seção de relatório (C2), rodar `grep` pelos nomes das funções em `lib/reports/queries.ts`, no `aquecer-relatorios` e em `render-section.tsx` antes de apagar.

## 5. Fora de questão (decisões do owner)

Heloísa e o proativo, o SDR, a agenda pública, as cadências e o playbook, a proposta em faixa, a simulação do fundo, o portal do parceiro e o contrato, as comissões, condomínio e multiproduto, Google Ads e Meta CAPI, a visibilidade de marketing (§5) e o roteamento (§6.4) não são propostos para remoção. O C7 só pergunta se a parada do score foi intencional.

## Apêndice A — consultas usadas (todas SELECT)

- `pg_stat_user_tables`: contagem de linhas por tabela.
- `audit_log`: agrupado por `acao`, com contagens em 30 e 90 dias, data da última ocorrência e usuários distintos; agrupado também por usuário. `relatorio_acessado` foi quebrado por `metadata.tipo` e `metadata.periodo`.
- `interacoes`: agrupada por `tipo` e `metadata->>'kind'`; separada entre sistema e humano (`autor_id is null`); evolução mensal das interações humanas; textos de `evento_sistema` sem `kind`.
- Para cada tabela de feature: `count`, contagens em 30 e 90 dias, `min` e `max` da data de criação.
- `leads`: CPF e cadastro PF por mês; CPFs repetidos desde junho (self-join); click IDs no `raw_payload`.

## Apêndice B — exports nunca referenciados (knip, conferidos por grep)

- `auth/permissions.ts`: `canAccessConfiguracoes`, `canAccessAudit`
- `cadencia/config.ts`: `cadenciaDoStatusFresh`
- `capi/dispatch.ts`: `listEnabledCapiPlatforms`
- `datetime/brt.ts`: `endOfBusinessDayBrt`, `previousBusinessDayYmdBrt`
- `formatters/currency.ts`: `formatBrlCompact`
- `google-ads/client.ts`: `resetGoogleAdsTokenCache`; e `google-ads/format.ts`, usado só em teste
- `horario-comercial.ts`: `foraHorarioComercial`
- `leads/list-leads.ts`: `listOrigensDistintas`
- `notifications/email-layout.ts`: `divider`, `leadCard`
- `parceiros/constants.ts`: `PARCEIRO_STATUS_TONE`, `PARCEIRO_TERMINAIS`
- `reports/comparativos.ts`: `withDelta`
- `reports/queries.ts`: `fetchVolumeAtribuidoPorDia`
- `status/canonical.ts`: `isSystemStatus`
- `status/queries.ts`: `getStatusLabelMap`
- `tracking/*`:
  - `ALL_CLICK_IDS`
  - `parseReferrerSimple`
  - `isAiReferrer`
  - `listChannelsWithCounts`
  - `isCanonicalSource`
  - `isChannel`
  - `isAiUtmSource`
- `validators/lead.ts`: `statusLeadEnum`
- `validators/rule.ts`: `ACAO_TIPOS`
- `components/shared/illustrations.tsx`: `EmptyKanban`, `EmptyAlerts`
- `components/shared/skeletons.tsx`: `SkeletonTarefas`, sobra do sistema de tarefas aposentado em maio
- `components/shared/nav-config.ts`: `ROUTE_META`
- `components/relatorios/charts/theme.ts`: `CHART_COLORS`
- `src/components/ui`: 33 exports do shadcn sem uso em 13 arquivos. É normal e não precisa mexer.
