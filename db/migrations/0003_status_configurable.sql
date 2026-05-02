-- ============================================================================
-- B1+B2: Status do lead virou configurável.
-- ============================================================================
-- Antes: enum `status_lead` fixo no código (10 valores). Admin não conseguia
--        criar/desativar/renomear status do funil.
-- Depois: leads.status = text livre. Tabela `status_lead_config` controla
--         quais keys existem, label, ordem e se está ativo. Sistema seeda
--         os 10 originais como `e_sistema=true` (não-deletáveis, mas
--         desativáveis e renomeáveis no label). Custom statuses entram
--         como `e_sistema=false`.
--
-- IDEMPOTENTE: ON CONFLICT no INSERT, IF NOT EXISTS no CREATE TABLE,
-- DROP VIEW IF EXISTS antes do ALTER (a view leads_marketing referencia
-- leads.status então precisa ser dropada e recriada — o cast enum->text
-- bloqueia se houver dependentes).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "status_lead_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "ordem" integer NOT NULL DEFAULT 0,
  "ativo" boolean NOT NULL DEFAULT true,
  "e_terminal" boolean NOT NULL DEFAULT false,
  "e_sistema" boolean NOT NULL DEFAULT false,
  "cor" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_status_config_ordem" ON "status_lead_config"("ordem");
--> statement-breakpoint

INSERT INTO "status_lead_config" ("key", "label", "ordem", "ativo", "e_terminal", "e_sistema") VALUES
  ('novo', 'Novo', 0, true, false, true),
  ('conversa_inicial', 'Conversa inicial', 10, true, false, true),
  ('aguardando_resposta', 'Aguardando resposta', 20, true, false, true),
  ('aguardando_documentacao', 'Aguardando documentação', 30, true, false, true),
  ('documentacao_enviada', 'Documentação enviada', 40, true, false, true),
  ('em_negociacao', 'Em negociação', 50, true, false, true),
  ('fechado', 'Fechado', 60, true, true, true),
  ('perdido', 'Perdido', 70, true, true, true),
  ('sem_resposta', 'Sem resposta', 80, true, true, true),
  ('desqualificado', 'Desqualificado', 90, true, true, true)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

-- View leads_marketing referencia leads.status — precisa ser dropada antes
-- do cast enum->text. Recriada ao final com a mesma estrutura mas usando
-- `text` agora.
DROP VIEW IF EXISTS public.leads_marketing;
--> statement-breakpoint

-- leads.status: enum -> text. USING preserva os valores existentes.
ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" TYPE text USING "status"::text;
--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'novo';
--> statement-breakpoint

-- mensagens_template.status_aplicavel: enum[] -> text[].
ALTER TABLE "mensagens_template" ALTER COLUMN "status_aplicavel" TYPE text[] USING "status_aplicavel"::text[];
--> statement-breakpoint

-- Agora seguro dropar o type — nenhuma coluna ainda referencia.
DROP TYPE IF EXISTS "public"."status_lead";
--> statement-breakpoint

-- Recria a view leads_marketing. Agora `status` é text, não enum, mas
-- a estrutura da view fica idêntica à definição original em db/policies.sql.
CREATE OR REPLACE VIEW public.leads_marketing
WITH (security_invoker = false)
AS
SELECT
  id,
  nome,
  CASE
    WHEN cpf IS NULL THEN NULL
    ELSE '***.***.***-' || RIGHT(REGEXP_REPLACE(cpf, '\D', '', 'g'), 2)
  END AS cpf,
  estado_civil,
  ocupacao,
  CASE
    WHEN renda_mensal_centavos IS NULL THEN NULL
    WHEN renda_mensal_centavos <  500000  THEN 'Até R$ 5k'
    WHEN renda_mensal_centavos < 1000000  THEN 'R$ 5k–10k'
    WHEN renda_mensal_centavos < 2000000  THEN 'R$ 10k–20k'
    WHEN renda_mensal_centavos < 5000000  THEN 'R$ 20k–50k'
    ELSE                                       'Acima R$ 50k'
  END AS renda_faixa,
  NULL::text AS whatsapp,
  CASE
    WHEN email IS NULL THEN NULL
    ELSE '***@' || SPLIT_PART(email, '@', 2)
  END AS email,
  cidade,
  estado,
  produto,
  objetivo_credito,
  tipo_imovel,
  situacao_imovel,
  tipo_pessoa,
  valor_imovel_centavos,
  valor_credito_centavos,
  status,
  motivo_desqualificacao,
  consultor_id,
  atribuido_em,
  atribuido_por,
  origem,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_term,
  utm_content,
  gclid,
  rede,
  dispositivo,
  palavra_chave,
  grupo_anuncios,
  criativo,
  tipo_correspondencia,
  referrer,
  pagina_entrada,
  NULL::text   AS banco_aprovador,
  NULL::bigint AS valor_liberado_centavos,
  NULL::bigint AS comissao_centavos,
  data_fechamento,
  ultimo_contato,
  created_at,
  updated_at
FROM public.leads
WHERE current_user_perfil() = 'marketing';
--> statement-breakpoint

REVOKE ALL ON public.leads_marketing FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON public.leads_marketing FROM anon;
--> statement-breakpoint
GRANT SELECT ON public.leads_marketing TO authenticated;
