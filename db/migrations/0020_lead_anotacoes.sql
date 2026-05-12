-- ============================================================================
-- Lead Annotations — anotações livres editáveis sobre o cliente
-- ============================================================================
-- Tabela dedicada (não reusa `interacoes`) porque:
--   1. Semântica: anotações são EDITÁVEIS e DELETÁVEIS; interações são
--      imutáveis por design de audit trail.
--   2. UI: vai em aba separada da timeline de contatos.
--   3. Permissions: delete só admin; create/update admin + consultor atribuído.
--
-- Migration retroativa: copia interacoes.tipo='anotacao' pra cá preservando
-- created_at + autor. Cleanup das rows antigas em migration separada (0021).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "lead_anotacoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "titulo" text,                                              -- opcional
  "conteudo" text NOT NULL,                                   -- texto puro
  "autor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "editado_em" timestamptz,
  "editado_por" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lead_anotacoes_lead"
  ON "lead_anotacoes" ("lead_id", "created_at" DESC);
--> statement-breakpoint

-- Migração retroativa: copia anotações existentes da timeline pra cá.
-- WHERE NOT EXISTS torna idempotente caso rode duas vezes.
INSERT INTO "lead_anotacoes" ("lead_id", "conteudo", "autor_id", "created_at", "updated_at")
SELECT
  i."lead_id",
  COALESCE(i."conteudo", '(anotação sem conteúdo)'),
  i."autor_id",
  i."criado_em",
  i."criado_em"
FROM "interacoes" i
WHERE i."tipo" = 'anotacao'
  AND NOT EXISTS (
    SELECT 1 FROM "lead_anotacoes" la
    WHERE la."lead_id" = i."lead_id" AND la."created_at" = i."criado_em"
  );
