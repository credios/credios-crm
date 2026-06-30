-- SDR (Heloísa agenda reuniões). Tabela de reuniões agendadas na agenda do
-- consultor (Google Calendar + Meet) e 2 fatos extras de qualificação que a IA
-- captura na conversa (possui imóvel pra garantia? há pendência bloqueante?).
-- Idempotente: aplicado em prod via pooler; este arquivo é o registro p/ fresh setup.

CREATE TABLE IF NOT EXISTS "reunioes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL,
  "consultor_id" uuid,
  "google_event_id" text,
  "meet_link" text,
  "inicio" timestamp with time zone NOT NULL,
  "fim" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'agendada' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "reunioes" ADD CONSTRAINT "reunioes_lead_id_leads_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "reunioes" ADD CONSTRAINT "reunioes_consultor_id_users_id_fk"
    FOREIGN KEY ("consultor_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_reunioes_lead" ON "reunioes" ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reunioes_consultor" ON "reunioes" ("consultor_id","inicio");--> statement-breakpoint

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualif_tem_imovel_garantia" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualif_pendencia_bloqueante" text;
