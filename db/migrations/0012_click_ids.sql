-- ============================================================================
-- Adiciona colunas pra click IDs de plataformas além do Google Ads.
-- ============================================================================
-- O site agora captura também:
--   fbclid    — Meta (adicionado em todo clique de Facebook/Instagram,
--               orgânico ou pago — ajuda a desinflar "Orgânico")
--   msclkid   — Microsoft Ads
--   ttclid    — TikTok Ads
--   wbraid    — Google ATT (iOS web-to-app)
--   gbraid    — Google ATT (iOS app-to-web)
--
-- Hoje só rodamos Google Ads, mas Meta passa fbclid em tráfego orgânico,
-- então essa coluna já vai capturar muitos leads do Instagram/Facebook
-- vindos sem UTM. As demais ficam vazias até que campanhas dessas
-- plataformas sejam criadas — captura preventiva sem custo.
-- ============================================================================

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "fbclid" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "msclkid" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ttclid" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "wbraid" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "gbraid" text;
