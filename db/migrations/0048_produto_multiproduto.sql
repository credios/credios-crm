-- Multiproduto, fase 1 (2026-10-13): `leads.produto` deixa de ser texto livre.
-- Até aqui todo lead era 'CGI' (conferido em prod antes de aplicar: 749/749),
-- mas o Portal de Parceiros já oferece CONDOMINIO e FINANCIAMENTO no form de
-- indicação — o CHECK aceita os três e o webhook canoniza a grafia.
-- Idempotente; aplicar em prod via pooler.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_produto_check' AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_produto_check"
      CHECK ("produto" IN ('CGI', 'CONDOMINIO', 'FINANCIAMENTO'));
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_leads_produto" ON "leads" ("produto", "created_at" DESC);
