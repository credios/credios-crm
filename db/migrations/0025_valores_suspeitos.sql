-- ============================================================================
-- Detecção de leads com valores monetários fora do range esperado.
--
-- Contexto: ~5-10% dos leads chegam com erro de digitação grosseiro
-- (renda R$ 6 milhões, imóvel R$ 110 milhões). Distorce métricas do
-- pipeline e atrapalha o consultor. Solução em 2 camadas:
--   1. Site: modal de confirmação ao passar thresholds (R$ 30M imóvel,
--      R$ 10M crédito, R$ 1M renda).
--   2. CRM (esta migration): grava flag + UI pra revisar com 1 clique
--      (aceitar valores como estão OU dividir por 1000 os estourados).
--
-- Colunas:
--   - valores_suspeitos: jsonb com {campos, valores_originais} preservado
--     mesmo após revisão (audit trail).
--   - valores_revisado_em: NULL = aguardando revisão; preenchido após.
--   - valores_revisado_por: quem revisou.
--   - valores_revisado_acao: 'mantido' (valores estavam certos) ou
--     'dividido_por_1000' (consultor aceitou a correção sugerida).
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS valores_suspeitos jsonb;
--> statement-breakpoint

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS valores_revisado_em timestamptz;
--> statement-breakpoint

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS valores_revisado_por uuid REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS valores_revisado_acao text;
--> statement-breakpoint

-- Index parcial: só leads aguardando revisão. Usado pelo badge no
-- Kanban/Lista e pelo card "X leads aguardando revisão" no dashboard.
CREATE INDEX IF NOT EXISTS idx_leads_valores_suspeitos_pendentes
  ON public.leads (created_at DESC)
  WHERE valores_suspeitos IS NOT NULL AND valores_revisado_em IS NULL;
