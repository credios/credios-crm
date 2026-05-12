-- ============================================================================
-- Tracking taxonomy: hierarchical Channel × Source with extensible catalog
-- ============================================================================
-- Substitui o enum hardcoded `ORIGENS` por uma taxonomia em 2 camadas:
--   - Channel: estável (GA4-aligned), 12 valores
--   - Source: extensível via tabela `tracking_sources` (admin gerencia pela UI)
--
-- Mudanças:
--   1. Novas colunas em `leads`: channel, source, paid, touches (jsonb), e
--      click IDs novos (li_fat_id, twclid, rdt_cid, sccid, pin_aid, epik,
--      irclickid, cjevent).
--   2. Coluna legada `origem` é mantida — vira mirror de `source` por
--      compatibilidade; será removida depois de 90 dias.
--   3. 3 tabelas novas: `tracking_sources`, `tracking_source_aliases`,
--      `tracking_unknowns`.
--   4. Index novos pra channel/source pra filtros e relatórios.
-- ============================================================================

-- ── 1. Novas colunas em leads ────────────────────────────────────────────────
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "channel" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "source" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "paid" boolean DEFAULT false;
--> statement-breakpoint
-- Multi-touch storage. Array de objetos { timestamp, channel, source, paid,
-- utm_campaign, landing_page, ... } pra permitir modelos de atribuição
-- (first-touch, last-touch, linear) computados em report-time.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "touches" jsonb;
--> statement-breakpoint

-- ── 2. Click IDs adicionais ──────────────────────────────────────────────────
-- Estes IDs cobrem plataformas que a Credios pode usar no futuro. Captura
-- preventiva sem custo — campos ficam NULL até que uma campanha rode.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "li_fat_id" text;  -- LinkedIn Ads
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "twclid" text;     -- X/Twitter Ads
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "rdt_cid" text;    -- Reddit Ads
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "sccid" text;      -- Snapchat Ads
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "pin_aid" text;    -- Pinterest Ads
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "epik" text;       -- Pinterest Ads (alt)
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "irclickid" text;  -- Impact affiliate
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cjevent" text;    -- CJ affiliate
--> statement-breakpoint

-- ── 3. Indexes pra filtros/relatórios ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_leads_channel" ON "leads" ("channel");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_source" ON "leads" ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leads_paid" ON "leads" ("paid") WHERE "paid" = true;
--> statement-breakpoint

-- ── 4. tracking_sources — catálogo canônico ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "tracking_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" text NOT NULL UNIQUE,
  "channel" text NOT NULL,
  "paid" boolean NOT NULL DEFAULT false,
  "display_name" text NOT NULL,
  "color" text,
  "icon" text,
  "ordem" integer NOT NULL DEFAULT 0,
  "ativo" boolean NOT NULL DEFAULT true,
  -- patterns: array de strings que classificam um lead pra esse source.
  -- Ex: { "referrer_hosts": ["chatgpt.com"], "utm_aliases": ["openai"] }
  -- Mantido como JSON pra flexibilidade (regex futuro).
  "patterns" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracking_sources_channel" ON "tracking_sources" ("channel");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracking_sources_ordem" ON "tracking_sources" ("ordem");
--> statement-breakpoint

-- ── 5. tracking_source_aliases — alias → source ──────────────────────────────
CREATE TABLE IF NOT EXISTS "tracking_source_aliases" (
  "alias" text PRIMARY KEY,    -- já em lowercase
  "source" text NOT NULL REFERENCES "tracking_sources"("source") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- ── 6. tracking_unknowns — quarantine de utm/referrer não reconhecidos ──────
CREATE TABLE IF NOT EXISTS "tracking_unknowns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" uuid REFERENCES "leads"("id") ON DELETE CASCADE,
  "raw_origem" text,
  "raw_referrer" text,
  "raw_utm_source" text,
  "raw_utm_medium" text,
  "raw_utm_campaign" text,
  "raw_click_ids" jsonb,
  "resolved_to_source" text,
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracking_unknowns_resolved" ON "tracking_unknowns" ("resolved_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracking_unknowns_created" ON "tracking_unknowns" ("created_at" DESC);
