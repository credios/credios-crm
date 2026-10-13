-- Multiproduto, fase 2 (2026-10-13): perfil de CONDOMÍNIO.
-- O condomínio continua sendo uma linha de `leads` (status, atribuição,
-- timeline, cadência e relatórios giram em torno de lead_id); os dados que só
-- existem nesse produto ficam nesta tabela-irmã 1:1. Em `leads`:
--   nome = nome do condomínio · whatsapp/email = contato do síndico ·
--   cidade/estado = localização · valor_credito / objetivo_credito = operação.
-- Idempotente; aplicar em prod via pooler.

CREATE TABLE IF NOT EXISTS "lead_condominio" (
  "lead_id" uuid PRIMARY KEY REFERENCES "leads"("id") ON DELETE CASCADE,
  "cnpj" text,
  "cep" text,
  "logradouro" text,
  "numero" text,
  "complemento" text,
  "bairro" text,
  "sindico_nome" text,
  "sindico_cpf" text,
  "sindico_profissional" boolean,
  "sindico_mandato_fim" date,
  "administradora" text,
  "num_unidades" integer,
  "arrecadacao_mensal_centavos" bigint,
  -- pontos-base: 850 = 8,50%
  "inadimplencia_bps" integer CHECK ("inadimplencia_bps" BETWEEN 0 AND 10000),
  "fundo_reserva_centavos" bigint,
  "finalidade_detalhes" text,
  "prazo_desejado_meses" integer,
  "obra_orcada" boolean,
  "assembleia_status" text CHECK ("assembleia_status" IN (
    'nao_convocada', 'convocada', 'aprovada', 'reprovada'
  )),
  "assembleia_data" date,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lead_condominio_cnpj" ON "lead_condominio" ("cnpj") WHERE "cnpj" IS NOT NULL;--> statement-breakpoint

-- RLS deny-total: acesso 100% server-side (mesmo padrão de `parceiros`).
ALTER TABLE "lead_condominio" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Parceiro indicador como vínculo real. `parceiro_nome`/`parceiro_portal_id`
-- (texto, vindos do portal) continuam existindo até a migração do portal.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "parceiro_id" uuid REFERENCES "parceiros"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_parceiro" ON "leads" ("parceiro_id") WHERE "parceiro_id" IS NOT NULL;--> statement-breakpoint

-- Leads que já chegaram do portal: liga pelo id do parceiro no portal.
UPDATE "leads" l
SET "parceiro_id" = p."id"
FROM "parceiros" p
WHERE l."parceiro_id" IS NULL
  AND l."parceiro_portal_id" IS NOT NULL
  AND p."portal_partner_id" = l."parceiro_portal_id";
