-- ============================================================================
-- Revoga SELECT das MVs de relatorios pra anon e authenticated.
-- ============================================================================
-- Motivo: a anon key do Supabase é pública no frontend; com SELECT na MV,
-- qualquer um podia ler agregados de negócio (volume por origem, valores
-- buscados/liberados, comissão, performance por consultor) via PostgREST.
--
-- O app só lê essas MVs server-side via Drizzle, que conecta como o user
-- `postgres` (superuser). authenticated/anon não precisam de acesso.
-- service_role mantém — é o "escape hatch" pro próprio Supabase admin.
-- ============================================================================

REVOKE SELECT ON public.mv_leads_diarios FROM anon;
--> statement-breakpoint
REVOKE SELECT ON public.mv_leads_diarios FROM authenticated;
--> statement-breakpoint
REVOKE SELECT ON public.mv_fechados_diarios FROM anon;
--> statement-breakpoint
REVOKE SELECT ON public.mv_fechados_diarios FROM authenticated;
