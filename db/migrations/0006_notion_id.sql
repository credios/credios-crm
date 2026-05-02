-- ============================================================================
-- Coluna `notion_id` em leads pra idempotência da importação do Notion.
-- ============================================================================
-- Cada arquivo .md exportado tem um UUID Notion no nome do arquivo
-- (ex: "...352d17b1f9ae8118bb18e6949564bf1c.md"). Usamos esse ID pra:
--  - Detectar leads já importados antes (skip ou update)
--  - Permitir re-execução do import sem duplicar
--  - Rastrear origem pra debug/auditoria
--
-- UNIQUE PARTIAL: só leads importados têm valor; resto fica NULL sem
-- ocupar slot do índice unique.
-- ============================================================================

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "notion_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_leads_notion_id"
  ON "leads"("notion_id")
  WHERE "notion_id" IS NOT NULL;
