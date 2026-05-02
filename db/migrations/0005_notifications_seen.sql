-- ============================================================================
-- Notificações: persistir "última vez que vi" por usuário.
-- ============================================================================
-- Sino do header conta leads novos das últimas 24h. Antes contava tudo, então
-- ficava vermelho permanente. Agora filtra `created_at > notifications_seen_at`
-- — quando user marca como lido (manual ou auto após abrir dropdown), zera
-- o badge até chegar lead novo.
-- ============================================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifications_seen_at" timestamp with time zone;
