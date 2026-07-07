-- Cadência de follow-up (playbook executável) — 2026-07-06.
-- Estado da cadência no lead + tabela de configuração dos passos por status
-- (editável pelo Admin em /configuracoes/cadencias). Idempotente; aplicado em
-- prod via pooler. Seed dos passos/templates: script (templates vivem no DB).

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cadencia_passo" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cadencia_proxima_em" timestamptz;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cadencia_inicio_em" timestamptz;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cadencia_adiamentos" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cadencia_pulos" integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_cadencia_proxima" ON "leads" ("consultor_id", "cadencia_proxima_em") WHERE "cadencia_proxima_em" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cadencia_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status_key" text NOT NULL UNIQUE,
  "passos" jsonb NOT NULL,
  "ativa" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- RLS (regra da casa: toda tabela nova). Leitura para autenticados; escrita só
-- pelo app (role owner bypassa RLS) — mesmo padrão do status_lead_config.
ALTER TABLE "cadencia_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS cadencia_config_select_authenticated ON "cadencia_config";--> statement-breakpoint
CREATE POLICY cadencia_config_select_authenticated ON "cadencia_config"
  FOR SELECT TO authenticated USING (true);
