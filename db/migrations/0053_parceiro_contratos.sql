-- Portal do parceiro, fase 4c (2026-10-13): contrato de parceria com
-- assinatura eletrônica (código por e-mail + trilha de auditoria + PDF final
-- com manifesto). O texto mesclado e os PDFs ficam NA LINHA do contrato:
-- contrato assinado é prova, não pode depender de modelo que muda depois.
-- `legado_id` recebe o id do contrato no portal antigo (migração 4d).
-- Idempotente; aplicar em prod via SQL Editor ou pooler.

CREATE TABLE IF NOT EXISTS "parceiro_contratos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parceiro_id" uuid NOT NULL REFERENCES "parceiros"("id") ON DELETE RESTRICT,
  "versao_modelo" integer NOT NULL,
  "corpo_html" text NOT NULL,
  "status" text NOT NULL DEFAULT 'enviado' CHECK ("status" IN (
    'enviado', 'visualizado', 'assinado_parceiro', 'concluido', 'cancelado'
  )),
  "codigo_verificacao" text NOT NULL UNIQUE,
  "otp_hash" text,
  "otp_expira_em" timestamptz,
  "otp_tentativas" integer NOT NULL DEFAULT 0,
  "otp_verificado" boolean NOT NULL DEFAULT false,
  "pdf_original" bytea,
  "pdf_assinado" bytea,
  "hash_documento" text,
  "enviado_em" timestamptz,
  "visualizado_em" timestamptz,
  "assinado_em" timestamptz,
  "credios_assinado_em" timestamptz,
  "credios_assinante_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "credios_assinante_nome" text,
  "legado_id" text UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parceiro_contratos_parceiro" ON "parceiro_contratos" ("parceiro_id", "created_at" DESC);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "parceiro_contrato_eventos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contrato_id" uuid NOT NULL REFERENCES "parceiro_contratos"("id") ON DELETE CASCADE,
  -- GENERATED | SENT | LINK_OPENED | OTP_SENT | OTP_VERIFIED | SIGNED |
  -- ADMIN_SIGN_REQUESTED | ADMIN_SIGNED | DOWNLOADED (mesmos nomes do portal antigo)
  "evento" text NOT NULL,
  "ip" text,
  "user_agent" text,
  "metadata" jsonb,
  "criado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parceiro_contrato_eventos" ON "parceiro_contrato_eventos" ("contrato_id", "criado_em");--> statement-breakpoint

-- RLS deny-total: contratos e trilha só são lidos server-side.
ALTER TABLE "parceiro_contratos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "parceiro_contrato_eventos" ENABLE ROW LEVEL SECURITY;
