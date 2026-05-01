CREATE TABLE "webhook_idempotency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payload_hash" text NOT NULL,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_idempotency_payload_hash_unique" UNIQUE("payload_hash")
);
--> statement-breakpoint
ALTER TABLE "webhook_idempotency" ADD CONSTRAINT "webhook_idempotency_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_webhook_idem_created" ON "webhook_idempotency" USING btree ("created_at" DESC);