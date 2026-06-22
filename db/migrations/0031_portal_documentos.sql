-- Portal de documentos (Objetivo 2).
--
-- lead_portal_tokens: link mágico por lead (acesso público sem login). Guardamos
--   só o hash sha256 do token; o valor cru vive na URL enviada ao cliente.
-- lead_documentos: metadado dos arquivos enviados (o binário fica no bucket
--   privado `documentos-leads`). `tipo` é a chave estruturada da checklist.
-- bucket: criado aqui de forma idempotente, privado, com limite de 25 MB e
--   MIME allowlist (imagens + PDF). Downloads só via URL assinada server-side.

CREATE TABLE IF NOT EXISTS "lead_portal_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "last_used_at" timestamp with time zone,
  "revogado_em" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_documentos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "tipo" text NOT NULL,
  "categoria" text NOT NULL,
  "rotulo" text NOT NULL,
  "storage_path" text NOT NULL,
  "filename_original" text,
  "mime" text,
  "tamanho_bytes" bigint,
  "origem" text DEFAULT 'portal' NOT NULL,
  "uploaded_por" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_tokens_lead" ON "lead_portal_tokens" ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documentos_lead" ON "lead_documentos" ("lead_id","created_at" DESC);--> statement-breakpoint
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos-leads',
  'documentos-leads',
  false,
  26214400,
  ARRAY['image/jpeg','image/png','image/heic','image/heif','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;
