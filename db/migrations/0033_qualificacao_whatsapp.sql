-- Qualificação por WhatsApp (Heloísa, IA — Objetivo 3 Fase B).
-- Campos preenchidos pela IA durante a conversa de qualificação no WhatsApp,
-- no estilo Avanti: confirma a proposta e levanta pontos-chave do imóvel pra o
-- consultor já chegar com tudo na mão.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualif_objetivo" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualif_titularidade" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualif_imovel_regularizado" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualif_pendencia_juridica" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualif_urgencia" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualif_whatsapp_status" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualif_whatsapp_em" timestamp with time zone;
