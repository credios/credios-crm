-- Portal do parceiro dentro do CRM, fase 4a (2026-10-13): identidade e sessão.
--
-- Parceiro é uma identidade SEPARADA dos funcionários: não é linha em
-- `public.users` nem em `auth.users` (Supabase Auth). Login próprio, sessão
-- própria (cookie opaco → hash nesta tabela), revogável na hora. Assim uma
-- credencial de parceiro nunca vira sessão do CRM interno.
-- Idempotente; aplicar em prod via SQL Editor ou pooler.

ALTER TABLE "parceiros" ADD COLUMN IF NOT EXISTS "portal_acesso" text NOT NULL DEFAULT 'sem_acesso';--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parceiros_portal_acesso_check' AND conrelid = 'public.parceiros'::regclass
  ) THEN
    ALTER TABLE "parceiros"
      ADD CONSTRAINT "parceiros_portal_acesso_check"
      CHECK ("portal_acesso" IN ('sem_acesso', 'convidado', 'ativo', 'suspenso'));
  END IF;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "parceiro_usuarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- Um login por parceiro (mesma regra do portal antigo).
  "parceiro_id" uuid NOT NULL UNIQUE REFERENCES "parceiros"("id") ON DELETE CASCADE,
  "email" text NOT NULL UNIQUE,
  "nome" text NOT NULL,
  -- scrypt (formato em src/lib/portal-parceiro/senha.ts). NULL até aceitar o convite.
  "senha_hash" text,
  -- Tokens de uso único: só o SHA-256 fica no banco.
  "convite_token_hash" text UNIQUE,
  "convite_expira_em" timestamptz,
  "reset_token_hash" text UNIQUE,
  "reset_expira_em" timestamptz,
  "falhas_login" integer NOT NULL DEFAULT 0,
  "bloqueado_ate" timestamptz,
  "termos_aceitos_em" timestamptz,
  "ultimo_login_em" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "parceiro_sessoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "usuario_id" uuid NOT NULL REFERENCES "parceiro_usuarios"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "expira_em" timestamptz NOT NULL,
  "ip" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parceiro_sessoes_usuario" ON "parceiro_sessoes" ("usuario_id");--> statement-breakpoint

-- RLS deny-total: credenciais e sessões só são lidas server-side.
ALTER TABLE "parceiro_usuarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "parceiro_sessoes" ENABLE ROW LEVEL SECURITY;
