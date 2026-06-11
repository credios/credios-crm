-- Parceria (Portal de Parceiros — parceiros.credios.com.br)
-- Campos de primeira classe para leads indicados por parceiros: quem indicou,
-- vínculo com o cadastro no portal e as observações escritas pelo parceiro.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "parceiro_nome" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "parceiro_portal_id" text;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "observacoes_parceiro" text;
