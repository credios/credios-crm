-- Lembrete de reunião pro CONSULTOR (15 min antes, por e-mail) — 2026-07-07.
-- Flag de idempotência separada da do cliente (lembrete_enviado, ~30 min).
-- Idempotente; aplicado em prod via pooler.

ALTER TABLE "reunioes" ADD COLUMN IF NOT EXISTS "lembrete_consultor_enviado" boolean NOT NULL DEFAULT false;
