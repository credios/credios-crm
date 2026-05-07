-- ============================================================================
-- Remove status 'sem_resposta' do sistema.
-- ============================================================================
-- "Sem resposta" não é um STATUS — é um motivo pra marcar o lead como
-- `perdido`. O admin já tinha desativado o status em status_lead_config
-- (ativo=false), mas a row ainda existia e o código ainda tinha 45 refs
-- ao key. Leads que eventualmente caíssem em sem_resposta apareciam na
-- coluna 'novo' do Kanban (fallback de status inativo) — confuso.
--
-- Esta migration:
--   1. Move qualquer lead remanescente em status='sem_resposta' pra
--      status='perdido' com motivo_desqualificacao='Sem resposta'. Hoje
--      são 0 leads em produção, mas executamos por segurança.
--   2. Remove a row 'sem_resposta' de status_lead_config.
--
-- O código em src/lib foi limpo no mesmo commit. As migrations anteriores
-- (0000, 0001, 0003) que mencionam sem_resposta ficam como história — não
-- são reescritas.
-- ============================================================================

-- 1. Migra leads remanescentes (defensivo — em prod hoje são 0).
UPDATE leads
SET
  status = 'perdido',
  motivo_desqualificacao = COALESCE(motivo_desqualificacao, 'Sem resposta'),
  updated_at = now()
WHERE status = 'sem_resposta';

-- 2. Remove o status do funil. status_lead_config tem FK ON DELETE? Não —
-- leads.status é text livre, sem constraint. Seguro deletar.
DELETE FROM status_lead_config WHERE key = 'sem_resposta';
