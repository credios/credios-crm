-- Fecha o vetor PostgREST/anon na tabela saved_lead_views (mesmo padrão da
-- migration 0024, que ligou RLS em todas as tabelas públicas). O app usa
-- Drizzle via DATABASE_URL (role owner), que BYPASSA RLS — então isto não
-- muda nenhum fluxo do app; só impede leitura/escrita via a anon key exposta
-- no bundle do browser. Política: cada usuário só enxerga/gerencia as próprias
-- visualizações (user_id = auth.uid()). DROP IF EXISTS pra re-aplicação idempotente.

ALTER TABLE public.saved_lead_views ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS saved_lead_views_owner_all ON public.saved_lead_views;--> statement-breakpoint
CREATE POLICY saved_lead_views_owner_all
ON public.saved_lead_views FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
