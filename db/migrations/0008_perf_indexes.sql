-- ============================================================================
-- Índices de performance para queries de relatórios e painel executivo.
-- Cobrem subqueries correlatas / LEFT JOIN LATERAL em interacoes (esfriando,
-- SLA, performance consultor, percentis) e filtros por janela de fechamento
-- ou atribuição em leads.
--
-- IF NOT EXISTS = idempotente, pode reaplicar sem erro.
-- Não usamos CONCURRENTLY porque o drizzle-kit migrate roda cada arquivo
-- dentro de uma transação. Tabelas pequenas (centenas a poucos milhares
-- de linhas) — build em segundos.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_leads_fechado_data_fech"
  ON "leads" ("data_fechamento" DESC)
  WHERE "status" = 'fechado';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_leads_atribuido_em"
  ON "leads" ("atribuido_em" DESC)
  WHERE "atribuido_em" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_interacoes_manuais_lead"
  ON "interacoes" ("lead_id", "criado_em" DESC)
  WHERE "tipo" NOT IN ('mudanca_status', 'mudanca_atribuicao', 'evento_sistema');
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_interacoes_mudanca_status_lead"
  ON "interacoes" ("lead_id", "criado_em")
  WHERE "tipo" = 'mudanca_status';
