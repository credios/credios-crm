-- Remove as views materializadas dos relatórios (2026-10-15).
-- APLICAR DEPOIS do deploy que tirou a leitura delas (src/lib/reports/queries.ts)
-- e o cron /api/cron/refresh-mvs. Antes disso o código antigo ainda as lê.
--
-- Com ~1k leads, ler `leads` direto custa o mesmo; as views deixavam os
-- números até 30 min atrasados, não tinham produto/canal e cada REFRESH era
-- DDL no banco a cada 30 min.
DROP MATERIALIZED VIEW IF EXISTS public.mv_leads_diarios;--> statement-breakpoint
DROP MATERIALIZED VIEW IF EXISTS public.mv_fechados_diarios;
