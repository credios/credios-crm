-- Momento em que a AGENDA PÚBLICA foi oferecida na tela de sucesso do simulador.
-- O cron do proativo da Heloísa respeita 15 min a partir daqui (não da criação
-- do lead) — dá tempo de o cliente marcar sozinho antes de a IA abordar.
-- Idempotente; já aplicado em prod via pooler.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "agenda_oferecida_em" timestamptz;
