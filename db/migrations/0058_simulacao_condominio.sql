-- Simulação de crédito para condomínio no portal do parceiro (2026-10-20).
-- Toda aditiva e idempotente. APLICAR ANTES do deploy (o código lê as duas).

-- 1. Config admin (linha única): taxa por prazo, validade, IOF, faixa de valor.
CREATE TABLE IF NOT EXISTS "simulacao_condominio_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "config" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);--> statement-breakpoint

INSERT INTO "simulacao_condominio_config" ("config")
SELECT $j${
  "prazos": [
    {"meses": 6, "taxaAm": 2.5}, {"meses": 12, "taxaAm": 2.5}, {"meses": 18, "taxaAm": 2.5},
    {"meses": 24, "taxaAm": 2.5}, {"meses": 36, "taxaAm": 2.5}, {"meses": 48, "taxaAm": 2.5},
    {"meses": 60, "taxaAm": 2.5}
  ],
  "validadeDias": 15,
  "iofAdicionalPct": 0.38,
  "iofDiarioPct": 0.0041,
  "valorMinimo": 20000,
  "valorMaximo": 20000000
}$j$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "simulacao_condominio_config");--> statement-breakpoint

-- 2. Simulações geradas pelos parceiros (parametros = taxas congeladas).
CREATE TABLE IF NOT EXISTS "parceiro_simulacoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "codigo" text NOT NULL UNIQUE,
  "parceiro_id" uuid NOT NULL REFERENCES "parceiros"("id") ON DELETE CASCADE,
  "usuario_id" uuid REFERENCES "parceiro_usuarios"("id") ON DELETE SET NULL,
  "produto" text NOT NULL DEFAULT 'CONDOMINIO',
  "condominio_nome" text NOT NULL,
  "cnpj" text NOT NULL,
  "valor_credito_centavos" bigint NOT NULL,
  "num_unidades" integer,
  "finalidade" text,
  "parametros" jsonb NOT NULL,
  "criado_em" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_parceiro_simulacoes" ON "parceiro_simulacoes" ("parceiro_id", "criado_em" DESC);--> statement-breakpoint

-- 3. RLS sem policy = deny total (acesso só server-side, Drizzle como owner).
ALTER TABLE "simulacao_condominio_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "parceiro_simulacoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Conferência (deve voltar 2 linhas com rls = true e 7 prazos):
-- SELECT relname, relrowsecurity AS rls FROM pg_class
--  WHERE relname IN ('simulacao_condominio_config','parceiro_simulacoes');
-- SELECT jsonb_typeof(config), jsonb_array_length(config->'prazos') FROM simulacao_condominio_config;
