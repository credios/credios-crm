-- Flag de controle do lembrete de ~30 min antes da reunião (cron lembrete-reuniao).
-- Evita reenviar o lembrete a cada execução do cron. Idempotente; já aplicado em
-- prod via pooler.

ALTER TABLE "reunioes" ADD COLUMN IF NOT EXISTS "lembrete_enviado" boolean NOT NULL DEFAULT false;
