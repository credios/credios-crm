-- Multiproduto, fase 2 (2026-10-13): cada template do playbook pertence a um
-- produto. Os existentes são todos de CGI (default). Lead de condomínio só vê
-- templates de CONDOMINIO nas "Mensagens sugeridas".
-- Idempotente; aplicar em prod via pooler.

ALTER TABLE "mensagens_template" ADD COLUMN IF NOT EXISTS "produto" text NOT NULL DEFAULT 'CGI';--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mensagens_template_produto_check'
      AND conrelid = 'public.mensagens_template'::regclass
  ) THEN
    ALTER TABLE "mensagens_template"
      ADD CONSTRAINT "mensagens_template_produto_check"
      CHECK ("produto" IN ('CGI', 'CONDOMINIO', 'FINANCIAMENTO'));
  END IF;
END $$;
