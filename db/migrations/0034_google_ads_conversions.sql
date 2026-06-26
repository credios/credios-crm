-- Offline conversion tracking (CRM → Google Ads).
-- Fila/auditoria das conversões enviadas via offline conversion import (GCLID).
-- Uma linha por evento de conversão por lead; idempotência via
-- UNIQUE(lead_id, conversion_action). Ver src/lib/google-ads/.
-- As colunas de click-id (gclid/wbraid/gbraid) e utm_* já existem em `leads`
-- desde migrations anteriores — nada a alterar lá.

CREATE TABLE IF NOT EXISTS "google_ads_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"conversion_action" text NOT NULL,
	"order_id" text NOT NULL,
	"gclid" text,
	"wbraid" text,
	"gbraid" text,
	"value_cents" bigint,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"conversion_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"uploaded_at" timestamp with time zone,
	"retracted_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "google_ads_conversions" ADD CONSTRAINT "google_ads_conversions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_gads_conv_lead_action" ON "google_ads_conversions" USING btree ("lead_id","conversion_action");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gads_conv_status" ON "google_ads_conversions" USING btree ("status");
