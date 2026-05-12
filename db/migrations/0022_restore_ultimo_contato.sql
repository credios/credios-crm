-- ============================================================================
-- Restaura "Último contato registrado" como CONTATO (não anotação)
-- ============================================================================
-- Bug do dataset 0020: o botão "Marcar último contato" no header do lead
-- criava interações com tipo='anotacao' e conteudo='Último contato registrado'.
-- A migration 0020 levou todas essas pra `lead_anotacoes`, tratando-as como
-- anotações reais — quando na verdade são REGISTROS DE CONTATO.
--
-- Esta migration desfaz a transferência incorreta:
--   1. INSERT em `interacoes` (tipo='contato') pra cada row de
--      `lead_anotacoes` com conteudo = 'Último contato registrado'
--   2. DELETE essas rows de `lead_anotacoes`
--
-- Idempotente via NOT EXISTS — protege contra re-run.
-- ============================================================================

INSERT INTO "interacoes" ("lead_id", "tipo", "conteudo", "autor_id", "criado_em")
SELECT
  la."lead_id",
  'contato'::tipo_interacao,
  la."conteudo",
  la."autor_id",
  la."created_at"
FROM "lead_anotacoes" la
WHERE la."conteudo" = 'Último contato registrado'
  AND NOT EXISTS (
    SELECT 1 FROM "interacoes" i
    WHERE i."lead_id" = la."lead_id"
      AND i."tipo" = 'contato'
      AND i."conteudo" = 'Último contato registrado'
      AND i."criado_em" = la."created_at"
  );
--> statement-breakpoint

DELETE FROM "lead_anotacoes" WHERE conteudo = 'Último contato registrado';
