-- ============================================================================
-- Indexes pra página /atividades (admin/gerente)
-- ============================================================================
-- A query da página filtra por (autor_id, created_at) em duas tabelas:
--   - interacoes:  pra contar contatos do consultor X no período Y
--   - lead_anotacoes: idem pra anotações
--
-- Indexes parciais com WHERE autor_id IS NOT NULL excluem rows criadas
-- por webhook automático (sem autor humano) — não interessam nessa view e
-- mantêm o index ~30% menor.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_interacoes_autor_criado"
  ON "interacoes" ("autor_id", "criado_em" DESC)
  WHERE "autor_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_lead_anotacoes_autor_criado"
  ON "lead_anotacoes" ("autor_id", "created_at" DESC)
  WHERE "autor_id" IS NOT NULL;
