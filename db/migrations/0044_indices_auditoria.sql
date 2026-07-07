-- Índices apontados pela auditoria de performance — 2026-07-07.
-- Padrões de acesso da Mesa e da página do lead. Idempotente; aplicado em
-- prod via pooler.

-- Quase toda query da Mesa filtra (consultor_id, status).
CREATE INDEX IF NOT EXISTS "idx_leads_consultor_status"
  ON "leads" ("consultor_id", "status");--> statement-breakpoint

-- Card "documentos novos" + detecção de início de envio no upload do portal.
CREATE INDEX IF NOT EXISTS "idx_interacoes_docs_lead"
  ON "interacoes" ("lead_id", "criado_em" DESC)
  WHERE "tipo" = 'documento_recebido';--> statement-breakpoint

-- Reuniões abertas (fila de desfecho, próximas reuniões, lembretes).
CREATE INDEX IF NOT EXISTS "idx_reunioes_agendadas"
  ON "reunioes" ("consultor_id", "inicio")
  WHERE "status" = 'agendada';
