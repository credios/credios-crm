-- Cookies do Meta Pixel (_fbp / _fbc) no lead — 2026-08-09.
-- Parâmetros de correspondência da Conversions API. Vão CRUS pro Meta (não
-- hasheados, ao contrário de email/telefone). O `fbc` tem formato próprio
-- (`fb.1.<timestamp_ms>.<fbclid>`) — a CAPI descarta o fbclid cru, por isso
-- guardamos o cookie como o fbevents o escreveu. Quando o cookie não existe
-- (in-app browser do Instagram/Facebook descarta cookies), o adapter
-- reconstrói o fbc a partir de `fbclid` + `created_at`.
-- Idempotente; aplicar em prod via pooler.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "fbp" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "fbc" text;
