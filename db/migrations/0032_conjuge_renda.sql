-- Composição de renda pelo cônjuge.
-- Capturado no passo de complemento do simulador OU no portal de documentos
-- (quando o cliente pulou a última etapa). Quando conjuge_compoe_renda = true,
-- pedimos também os documentos de renda do cônjuge na checklist do portal.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conjuge_compoe_renda" boolean;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conjuge_renda_centavos" bigint;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conjuge_ocupacao" text;
