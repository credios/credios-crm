-- Consultas de score de crédito (Direct Data → QUOD) — 2026-07-07.
-- Histórico de consultas vinculado ao lead: score + faixa + payload bruto.
-- Manual: só admin (custa por hit). Automático: ao agendar reunião, com
-- dedup de 30 dias por CPF. Idempotente; aplicado em prod via pooler.

CREATE TABLE IF NOT EXISTS "consultas_score" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "cpf" text NOT NULL,
  "score" integer,
  "faixa" text,
  "fonte" text NOT NULL DEFAULT 'directd_quod',
  "raw_payload" jsonb,
  "consultado_por" uuid REFERENCES "users"("id"),
  "criado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consultas_score_lead" ON "consultas_score" ("lead_id", "criado_em" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consultas_score_cpf" ON "consultas_score" ("cpf", "criado_em" DESC);--> statement-breakpoint

-- RLS (regra da casa: toda tabela nova). Score é PII de crédito e a leitura é
-- 100% server-side (página do lead via Drizzle/owner) — RLS sem policy =
-- deny total via PostgREST, mesmo padrão do lead_portal_tokens.
ALTER TABLE "consultas_score" ENABLE ROW LEVEL SECURITY;
