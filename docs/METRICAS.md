# Glossário de Métricas — CRM Credios

Definições canônicas pra evitar ambiguidade entre páginas / queries.
Cada métrica indica:
- **Nome curto** (UI)
- **SQL canônico** (referência)
- **Onde é usada**

> **Princípio**: queries diferentes que dizem mostrar a mesma coisa precisam usar
> a mesma definição. Se duas páginas mostram "Leads novos no mês" com números
> diferentes, é bug.

---

## Conceitos-base

### `criado_em` vs `atribuido_em` vs `data_fechamento`

Os três timestamps marcam **momentos diferentes** do ciclo de vida do lead:

| Campo | Quando preenchido | Usado pra responder |
|---|---|---|
| `created_at` | Insert do row (webhook ou manual) | "Quando o lead **chegou no funil**?" |
| `atribuido_em` | Primeira vez que ganha `consultor_id != null` | "Quando o lead **entrou na carteira de alguém**?" |
| `data_fechamento` | Status muda pra `fechado` (modal exige) | "Quando a operação foi **fechada**?" |

**NUNCA** usar `created_at` pra calcular "atribuídos no período" ou "tempo na
carteira de X". O lead pode ter sido criado 6 meses atrás e atribuído essa
semana — o trabalho do consultor é desta semana.

---

## Métricas operacionais

### Leads novos (no período)
- **SQL**: `COUNT(*) WHERE created_at BETWEEN :from AND :to`
- **Definição**: leads que **chegaram ao funil** dentro do período.
- **Função**: `fetchKpis(filters, period).leadsNovosCount`
- **Usado em**: `/relatorios` (KPI hero), `/admin/painel-executivo`

### Leads atribuídos (no período)
- **SQL**: `COUNT(*) WHERE atribuido_em BETWEEN :from AND :to AND consultor_id = :id`
- **Definição**: leads que **entraram na carteira** do consultor (filtrável por user).
- **Função**: `fetchKpisConsultor(consultorId, period).atribuidosCount`
- **Usado em**: `/meu-desempenho` (KPI hero "Atribuídos")
- **Por que diferente de "Leads novos"**: lead criado em fev e atribuído em mar
  conta em **fev** pra Leads novos e em **mar** pra Atribuídos.

### Pipeline ativo (snapshot agora)
- **SQL**: `COUNT(*) WHERE status NOT IN ('fechado','perdido','desqualificado','sem_resposta')`
- **Definição**: leads ainda em movimento, sem decisão final. **Sem dependência de período.**
- **Função**: `fetchKpis(...).pipelineCount` e `fetchKpisConsultor(...).pipelineCount`
- **Usado em**: `/relatorios`, `/meu-desempenho`, `/admin/painel-executivo`

### Fechamentos (no período)
- **SQL**: `COUNT(*) WHERE status = 'fechado' AND data_fechamento BETWEEN :from AND :to`
- **Definição**: operações que **fecharam** dentro do período (não criadas).
- **Função**: `fetchKpis(...).fechadosCount` (todos) ou `fetchKpisConsultor(...).fechadosCount` (por consultor)

### Taxa de conversão — local ao período
- **SQL**: `fechados_no_periodo / atribuidos_no_periodo`
- **Definição**: % dos leads atribuídos que fecharam **no mesmo período**.
- **Função**: `fetchKpisConsultor(...).conversaoPeriodo.taxa`
- **Usado em**: `/meu-desempenho`
- **Atenção**: pode ser ruidosa em períodos curtos (1 fechamento em 5 atribuições = 20%).

### Taxa de conversão — rolling 90 dias
- **SQL**: `COUNT(*) FILTER (status='fechado' AND created_at > now()-90d) / COUNT(*) WHERE created_at > now()-90d`
- **Definição**: % de **conversão histórica** suavizada por janela móvel.
- **Função**: `fetchKpis(...).conversaoRolling90d.taxa`
- **Usado em**: `/relatorios` (visão consolidada operacional)

### Win rate (no período)
- **SQL**: `fechados / (fechados + perdidos + desqualificados)` no período
- **Função**: `fetchSalesMetrics(...).winRate`
- **Diferente de "Taxa de conversão"**: `Win rate` exclui leads ainda **em
  pipeline** do denominador. Conversão inclui (assume que pipeline ainda pode fechar).
- **Usado em**: `/admin/painel-executivo`

---

## Métricas financeiras (admin only)

| Nome | SQL | Função |
|---|---|---|
| **Receita realizada** | `SUM(comissao_centavos) WHERE status='fechado' AND data_fechamento BETWEEN :from AND :to` | `fetchKpis(...).fechadosComissaoCentavos` |
| **Volume liberado** | `SUM(valor_liberado_centavos) WHERE status='fechado' AND data_fechamento BETWEEN :from AND :to` | `fetchKpis(...).fechadosValorLiberadoCentavos` |
| **Ticket médio** | `AVG(valor_liberado_centavos) WHERE status='fechado'` | `fetchSalesMetrics(...).avgDealSizeCentavos` |
| **Comissão média** | `AVG(comissao_centavos) WHERE status='fechado'` | `fetchSalesMetrics(...).avgComissaoCentavos` |
| **Ciclo médio (dias)** | `AVG(EXTRACT(DAY FROM data_fechamento - created_at)) WHERE status='fechado'` | `fetchSalesMetrics(...).avgSalesCycleDays` |
| **Sales velocity** | `pipeline_value × win_rate / sales_cycle_days` | `fetchSalesMetrics(...).salesVelocityCentavosPerDay` |
| **Projeção do mês** | `comissao_fechada_mes_atual + (em_negociacao_count × win_rate × comissao_media)` | `fetchProjecaoMes()` |

---

## Métricas de saúde

### Esfriando (lead individual)
- **Definição**: lead **ativo** sem interação manual há ≥ 3 dias OU nunca teve
  interação manual e foi atribuído há ≥ 3 dias.
- **Função pessoal**: `fetchSaudePipeline(consultorId).esfriando` — escopado
- **Função global**: `fetchEsfriandoGlobal().count` — toda operação
- **Usado em**: `/meu-desempenho` (card pessoal), `/relatorios` (KPI saúde global)
- **Bug histórico**: até nov/2026 o KPI global em `/relatorios` somava o pipeline
  ativo INTEIRO (não só esfriando). Corrigido em B5.

### SLA atrasado (1º contato)
- **Definição**: lead `status='novo'` atribuído há ≥ 30min sem nenhuma interação
  manual, **dentro do horário comercial** (08-18 BRT seg-sex).
- **Função**: `checkSlaPrimeiroContato()` (cron) e `fetchSlaCompliance(...)` (relatórios)
- **Atomicidade**: índice único parcial `sla_alertas_unico_ativo` em
  `(lead_id, tipo) WHERE resolvido_em IS NULL` previne duplicação.

### Aguardando minha ação
- **Definição (OR de 3 critérios)**:
  - `status='novo' AND atribuido_em < now() - 2h`, OU
  - `status='conversa_inicial' AND COALESCE(ultima_interacao_manual, atribuido_em) < now() - 24h`, OU
  - `status='aguardando_documentacao' AND updated_at < now() - 5d`
- **Função**: `fetchSaudePipeline(consultorId).aguardandoAcao`
- **Usado em**: `/meu-desempenho`

---

## Janela de períodos

Filtros de data usam **fuso BRT (UTC-3)** — não UTC. Helpers em
`src/lib/datetime/brt.ts`:
- `startOfDayBrt("2026-03-15")` → `2026-03-15T03:00:00Z` (= 00:00 BRT)
- `endOfDayBrt("2026-03-15")` → `2026-03-16T02:59:59.999Z` (= 23:59:59 BRT)

> **Por que**: lead criado às 23:00 BRT cai no dia X BRT. Se o filtro fosse UTC,
> esse lead apareceria no dia seguinte (UTC). Distorce todos os relatórios.

> **TODO** futuro: se o Brasil voltar a usar HV, trocar `-03:00` fixo por
> `America/Sao_Paulo` via Intl.DateTimeFormat ou date-fns-tz.

---

## Comparativo de períodos

`fetchComparativoPeriodos(filters, curr, prev)` retorna 8 métricas com
`atual / anterior / Δ%`. Modos:
- **Anterior equivalente** (`anterior_equivalente`): mesma duração imediatamente antes
- **Mesmo período ano passado** (`ano_passado`): janela exata 1 ano atrás
- **Sem comparação** (`sem`): retorna [] (UI omite seção)

Helper de delta: `pctDelta(curr, prev)` retorna **null** quando `prev=0` e
`curr>0` (matematicamente indefinido), `0` quando ambos zero.
