-- Cadastro PF Plus (Direct Data) no lead — 2026-07-08.
-- Consulta automática em TODO formulário completo com CPF (barata; decisão do
-- owner). Payload do `retorno` fica no lead (1:1) + timestamp da consulta.
-- Idempotente; aplicado em prod via pooler.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cadastro_pf" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cadastro_pf_em" timestamptz;
