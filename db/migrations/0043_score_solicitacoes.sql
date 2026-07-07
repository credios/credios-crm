-- Solicitações de consulta de score (consultor pede → admin aprova) — 2026-07-07.
-- A consulta na Direct Data é paga e restrita a admin; o consultor agora pode
-- SOLICITAR pelo card do lead, e a aprovação vira fila na Mesa do admin.
-- Idempotente; aplicado em prod via pooler.

CREATE TABLE IF NOT EXISTS "score_solicitacoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "solicitado_por" uuid NOT NULL REFERENCES "users"("id"),
  "status" text NOT NULL DEFAULT 'pendente' CHECK ("status" IN ('pendente', 'aprovada', 'recusada')),
  "resolvido_por" uuid REFERENCES "users"("id"),
  "resolvido_em" timestamptz,
  "criado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_score_solicitacoes_pendentes" ON "score_solicitacoes" ("status", "criado_em") WHERE "status" = 'pendente';--> statement-breakpoint

-- RLS deny-total via PostgREST (leitura/escrita 100% server-side).
ALTER TABLE "score_solicitacoes" ENABLE ROW LEVEL SECURITY;
