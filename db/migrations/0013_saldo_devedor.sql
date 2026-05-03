-- ============================================================================
-- Adiciona coluna saldo_devedor_centavos na tabela leads.
-- ============================================================================
-- Aplicável apenas quando situacao_imovel = 'Financiado'. Quando o lead chega
-- com imóvel quitado, fica NULL. É enviado pelo simulador do site (que já
-- coleta esse dado no fluxo) e crítico no processo de venda:
--
--   - Define a viabilidade da operação (LTV efetivo após quitar o saldo)
--   - Define o valor líquido que vai pro cliente após o banco quitar o atual
--   - Em alguns casos, exige operação intra-banco (mesma instituição que
--     já financia o imóvel)
--
-- Antes desta migration, o dado vinha apenas no `raw_payload` JSONB do webhook,
-- o que dificultava queries, filtros e exibição direta na UI. Promover para
-- coluna nativa permite indexação, agregações e tratamento consistente.
-- ============================================================================

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "saldo_devedor_centavos" bigint;
