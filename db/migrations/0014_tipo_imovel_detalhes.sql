-- ============================================================================
-- Adiciona coluna tipo_imovel_detalhes na tabela leads.
-- ============================================================================
-- Preenchida apenas quando o cliente seleciona "Terreno" ou "Outro" no
-- simulador do site (essas categorias têm aceitação restrita por banco —
-- terrenos só são aceitos em condomínios fechados ou áreas urbanas
-- premium; "Outro" geralmente é galpão, fazenda ou imóvel rural, que
-- também não passam na maioria dos bancos parceiros).
--
-- Sem esse campo, leads desses tipos chegavam ao CRM sem contexto e o
-- consultor precisava ligar pra entender se a operação tinha viabilidade.
-- Com o esclarecimento já no lead, a triagem fica mais rápida.
--
-- Para tipos Casa/Apartamento/Sala Comercial, fica NULL (não há
-- ambiguidade nesses casos).
-- ============================================================================

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tipo_imovel_detalhes" text;
