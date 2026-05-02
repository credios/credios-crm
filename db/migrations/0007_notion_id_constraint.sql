-- ============================================================================
-- Troca o partial unique index de leads.notion_id por UNIQUE constraint
-- regular pra ON CONFLICT funcionar.
-- ============================================================================
-- ON CONFLICT (col) exige UNIQUE constraint OU índice unique não-partial.
-- Partial index com WHERE (criado em 0006) não satisfaz. Em PG 15+,
-- UNIQUE constraint regular ainda permite múltiplos NULLs (default
-- NULLS DISTINCT), então não causa problema com leads não-importados.
-- ============================================================================

DROP INDEX IF EXISTS "idx_leads_notion_id";
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_notion_id_unique" UNIQUE ("notion_id");
