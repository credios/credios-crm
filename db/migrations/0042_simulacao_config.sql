-- Config da proposta em faixa (simulação Avanti-style) — 2026-07-07.
-- Faixas de taxa, prazos exibidos, prazo destaque e comprometimento de renda,
-- editáveis pelo Admin em /configuracoes/simulacao (sem deploy). Idempotente;
-- aplicado em prod via pooler.

CREATE TABLE IF NOT EXISTS "simulacao_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "config" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- RLS (regra da casa). Leitura para autenticados (config não-sensível);
-- escrita só pelo app (role owner bypassa) — padrão do cadencia_config.
ALTER TABLE "simulacao_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS simulacao_config_select_authenticated ON "simulacao_config";--> statement-breakpoint
CREATE POLICY simulacao_config_select_authenticated ON "simulacao_config"
  FOR SELECT TO authenticated USING (true);
