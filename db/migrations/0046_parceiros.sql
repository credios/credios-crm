-- Módulo de Parceiros (2026-07-16): pipeline de relacionamento com parceiros
-- comerciais, do candidato (form do site) à parceria ativa (portal).
-- Separado de `leads` de propósito — B2B com ciclo próprio.
-- Idempotente; aplicado em prod via pooler.

CREATE TABLE IF NOT EXISTS "parceiros" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "empresa" text,
  "email" text,
  "whatsapp" text,
  "segmento" text,
  "cidade" text,
  "estado" text,
  "cpf_cnpj" text,
  "status" text NOT NULL DEFAULT 'novo' CHECK ("status" IN (
    'novo', 'em_contato', 'reuniao', 'proposta_enviada',
    'convidado_portal', 'ativo', 'perdido'
  )),
  "motivo_perda" text,
  "consultor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "atribuido_em" timestamptz,
  "origem" text NOT NULL DEFAULT 'site',
  "mensagem" text,
  "raw_payload" jsonb,
  "portal_partner_id" text,
  "convidado_portal_em" timestamptz,
  "ativo_em" timestamptz,
  "ultimo_contato" timestamptz,
  "notas" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parceiros_status" ON "parceiros" ("status", "created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parceiros_consultor" ON "parceiros" ("consultor_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_parceiros_portal_id" ON "parceiros" ("portal_partner_id") WHERE "portal_partner_id" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "parceiro_interacoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parceiro_id" uuid NOT NULL REFERENCES "parceiros"("id") ON DELETE CASCADE,
  "autor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "tipo" text NOT NULL CHECK ("tipo" IN (
    'ligacao', 'whatsapp', 'email', 'reuniao', 'anotacao',
    'mudanca_status', 'mudanca_atribuicao', 'evento_sistema'
  )),
  "conteudo" text,
  "metadata" jsonb,
  "criado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parceiro_interacoes" ON "parceiro_interacoes" ("parceiro_id", "criado_em" DESC);--> statement-breakpoint

-- RLS deny-total: dados comerciais acessados 100% server-side (service role).
ALTER TABLE "parceiros" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "parceiro_interacoes" ENABLE ROW LEVEL SECURITY;
