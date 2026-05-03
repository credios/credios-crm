-- ============================================================================
-- MATERIALIZED VIEWS — pré-agregação dos relatórios e painel executivo
-- ============================================================================
-- Move as agregações pesadas das queries em runtime pra um snapshot
-- pré-calculado. Refresh CONCURRENTLY a cada 30 min via Vercel Cron
-- (/api/cron/refresh-mvs).
--
-- 2 views cobrem ~70% das queries dos dashboards:
--
--   1. mv_leads_diarios     → contagem por dia de criação × origem ×
--                              estado × consultor × status. Cobre KPIs
--                              de leads novos, pipeline ativo, ROI por
--                              origem, performance por UF, volume/dia,
--                              funil/conversão.
--
--   2. mv_fechados_diarios  → contagem + somatórios por data de
--                              fechamento × origem × estado × consultor.
--                              Cobre KPIs de fechados-no-período, receita
--                              mensal, sparklines do painel executivo,
--                              sales metrics (ticket médio, ciclo de venda).
--
-- Queries que NÃO cabem nessas MVs (precisam de interacoes, raw_payload,
-- ou colunas demográficas) continuam tocando a tabela leads diretamente
-- com cache em memória de 120s — fetchSlaCompliance, fetchTempoPercentis,
-- fetchTempoMedioPorStatus, fetchEsfriandoGlobal, fetchPerformanceConsultores,
-- fetchDistribuicoes, fetchLossReasons, fetchTopOrigensDetalhadas.
--
-- Trade-off aceito: relatórios ficam até 30 min defasados.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. mv_leads_diarios
-- ----------------------------------------------------------------------------
-- Granularidade: 1 row por (dia_criacao, origem, estado, consultor, status).
-- COALESCE pra valores nulos garante que UNIQUE INDEX funciona em colunas
-- nullable (pré-requisito do REFRESH CONCURRENTLY).
--
-- consultor_id NULL vira o UUID zero — tratado como "pool não-atribuído"
-- na consumo. As queries que filtram por consultor usam o id real; pra
-- obter o pool, filtra por '00000000-0000-0000-0000-000000000000'::uuid.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_leads_diarios AS
SELECT
  date_trunc('day', created_at)::date AS dia_criacao,
  COALESCE(origem, 'Sem origem') AS origem,
  COALESCE(estado, '—') AS estado,
  COALESCE(consultor_id, '00000000-0000-0000-0000-000000000000'::uuid) AS consultor_id,
  status,
  COUNT(*)::int AS qtd,
  COALESCE(SUM(valor_credito_centavos), 0)::bigint AS soma_valor_credito,
  COALESCE(SUM(valor_liberado_centavos), 0)::bigint AS soma_valor_liberado,
  COALESCE(SUM(comissao_centavos), 0)::bigint AS soma_comissao
FROM public.leads
GROUP BY 1, 2, 3, 4, 5;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS mv_leads_diarios_uidx
  ON public.mv_leads_diarios (dia_criacao, origem, estado, consultor_id, status);
--> statement-breakpoint

-- Indexes secundários pras queries mais comuns.
CREATE INDEX IF NOT EXISTS mv_leads_diarios_dia_status
  ON public.mv_leads_diarios (dia_criacao, status);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS mv_leads_diarios_status
  ON public.mv_leads_diarios (status);
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. mv_fechados_diarios
-- ----------------------------------------------------------------------------
-- Apenas leads com status='fechado' E data_fechamento IS NOT NULL.
-- Granularidade: 1 row por (data_fechamento, origem, estado, consultor).
--
-- soma_segundos_ciclo guarda a soma de (data_fechamento - created_at) em
-- segundos. Pra calcular ciclo médio em dias: SUM(soma_segundos_ciclo) /
-- (SUM(qtd) * 86400.0). Mantemos em segundos pra evitar perda de precisão
-- num bigint (numeric também funcionaria, mas bigint é mais barato).

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_fechados_diarios AS
SELECT
  data_fechamento AS dia_fechamento,
  COALESCE(origem, 'Sem origem') AS origem,
  COALESCE(estado, '—') AS estado,
  COALESCE(consultor_id, '00000000-0000-0000-0000-000000000000'::uuid) AS consultor_id,
  COUNT(*)::int AS qtd,
  COALESCE(SUM(valor_liberado_centavos), 0)::bigint AS soma_valor_liberado,
  COALESCE(SUM(comissao_centavos), 0)::bigint AS soma_comissao,
  COALESCE(
    SUM(EXTRACT(EPOCH FROM (data_fechamento::timestamp - created_at)))::bigint,
    0
  ) AS soma_segundos_ciclo
FROM public.leads
WHERE status = 'fechado' AND data_fechamento IS NOT NULL
GROUP BY 1, 2, 3, 4;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS mv_fechados_diarios_uidx
  ON public.mv_fechados_diarios (dia_fechamento, origem, estado, consultor_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS mv_fechados_diarios_dia
  ON public.mv_fechados_diarios (dia_fechamento DESC);
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Permissões: apenas service_role. App lê via Drizzle como user `postgres`
-- (superuser) que não precisa de GRANT. anon/authenticated foram REVOKED em
-- 0011 — exporta agregados de negócio via PostgREST seria vazamento de
-- inteligência comercial.
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.mv_leads_diarios TO service_role;
--> statement-breakpoint
GRANT SELECT ON public.mv_fechados_diarios TO service_role;
