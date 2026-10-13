-- Parceiros, fase 3 (2026-10-13): gestão comercial dentro do CRM.
--   - produtos habilitados por parceiro (o que ele pode indicar);
--   - chave PIX e comissão padrão OPCIONAL (decisão do owner: no início a
--     comissão é caso a caso; a regra padrão vem depois);
--   - `parceiro_comissoes`: uma comissão por operação indicada.
-- Idempotente; aplicar em prod via SQL Editor ou pooler.

ALTER TABLE "parceiros" ADD COLUMN IF NOT EXISTS "produtos_habilitados" text[] NOT NULL DEFAULT ARRAY['CGI']::text[];--> statement-breakpoint
ALTER TABLE "parceiros" ADD COLUMN IF NOT EXISTS "pix_chave" text;--> statement-breakpoint
-- pontos-base: 300 = 3,00%. NULL = sem regra padrão (caso a caso).
ALTER TABLE "parceiros" ADD COLUMN IF NOT EXISTS "comissao_padrao_bps" integer CHECK ("comissao_padrao_bps" BETWEEN 0 AND 10000);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "parceiro_comissoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parceiro_id" uuid NOT NULL REFERENCES "parceiros"("id") ON DELETE RESTRICT,
  -- SET NULL: excluir o lead não apaga o registro financeiro.
  "lead_id" uuid REFERENCES "leads"("id") ON DELETE SET NULL,
  "descricao" text,
  "base_centavos" bigint,
  "percentual_bps" integer CHECK ("percentual_bps" BETWEEN 0 AND 10000),
  "valor_centavos" bigint NOT NULL CHECK ("valor_centavos" >= 0),
  "status" text NOT NULL DEFAULT 'prevista' CHECK ("status" IN (
    'prevista', 'a_pagar', 'paga', 'cancelada'
  )),
  "pago_em" date,
  "observacao" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
-- Uma comissão por operação (lead).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_parceiro_comissoes_lead" ON "parceiro_comissoes" ("lead_id") WHERE "lead_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parceiro_comissoes_parceiro" ON "parceiro_comissoes" ("parceiro_id", "created_at" DESC);--> statement-breakpoint

-- RLS deny-total: receita/custo confidencial, acesso só server-side (admin).
ALTER TABLE "parceiro_comissoes" ENABLE ROW LEVEL SECURITY;
