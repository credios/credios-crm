-- Um contrato PENDENTE por parceiro (2026-10-13). O teste de ponta a ponta
-- mostrou a página de contrato sendo renderizada duas vezes em paralelo e
-- gerando dois contratos pendentes. O código já converge pro mais antigo;
-- este índice é a garantia no banco.
-- Idempotente; aplicar em prod via SQL Editor ou pooler.

-- Sobra de corrida anterior: mantém o pendente mais antigo de cada parceiro.
UPDATE "parceiro_contratos" c
SET "status" = 'cancelado', "updated_at" = now()
WHERE c."status" IN ('enviado', 'visualizado')
  AND EXISTS (
    SELECT 1 FROM "parceiro_contratos" o
    WHERE o."parceiro_id" = c."parceiro_id"
      AND o."status" IN ('enviado', 'visualizado')
      AND (o."created_at", o."id") < (c."created_at", c."id")
  );--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_parceiro_contratos_pendente"
  ON "parceiro_contratos" ("parceiro_id")
  WHERE "status" IN ('enviado', 'visualizado');
