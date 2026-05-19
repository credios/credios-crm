-- ============================================================================
-- Habilita RLS nas 4 tabelas que ficaram de fora do db/policies.sql canonical
-- e da migration 0009 (que cobriu status_lead_config + task_config_por_status).
--
-- Tabelas afetadas (migrations 0017 e 0020):
--   - tracking_sources        — config: catálogo de sources de tráfego
--   - tracking_source_aliases — config: utm → source canônico
--   - tracking_unknowns       — quarentena de utm/referrer não reconhecidos
--   - lead_anotacoes          — texto livre sobre o cliente (PII)
--
-- Contexto:
--   O app TS usa Drizzle via DATABASE_URL (role superuser/owner), que BYPASSA
--   RLS por design. Logo, esta migration não muda nenhum fluxo do app — fecha
--   apenas o vetor de ataque público via PostgREST + NEXT_PUBLIC_SUPABASE_ANON_KEY
--   (que é exposta no bundle do browser).
--
-- Padrão idêntico ao usado em db/policies.sql + migration 0009: helper
-- public.current_user_perfil() já existe e é stable. DROP POLICY IF EXISTS
-- antes de cada CREATE pra permitir re-aplicação idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tracking_sources — config sem PII
--    Leitura: authenticated (UI precisa pra montar dropdowns de origem).
--    Escrita: admin (gerencia o catálogo em /configuracoes/tracking).
-- ----------------------------------------------------------------------------
ALTER TABLE public.tracking_sources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS tracking_sources_select_authenticated ON public.tracking_sources;
CREATE POLICY tracking_sources_select_authenticated
ON public.tracking_sources FOR SELECT TO authenticated
USING (true);
--> statement-breakpoint

DROP POLICY IF EXISTS tracking_sources_admin_write ON public.tracking_sources;
CREATE POLICY tracking_sources_admin_write
ON public.tracking_sources FOR ALL TO authenticated
USING (public.current_user_perfil() = 'admin')
WITH CHECK (public.current_user_perfil() = 'admin');
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. tracking_source_aliases — mapping utm → source. Mesmo padrão.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tracking_source_aliases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS tracking_source_aliases_select_authenticated ON public.tracking_source_aliases;
CREATE POLICY tracking_source_aliases_select_authenticated
ON public.tracking_source_aliases FOR SELECT TO authenticated
USING (true);
--> statement-breakpoint

DROP POLICY IF EXISTS tracking_source_aliases_admin_write ON public.tracking_source_aliases;
CREATE POLICY tracking_source_aliases_admin_write
ON public.tracking_source_aliases FOR ALL TO authenticated
USING (public.current_user_perfil() = 'admin')
WITH CHECK (public.current_user_perfil() = 'admin');
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. tracking_unknowns — quarentena com lead_id + raw utm/referrer.
--    Sensibilidade média (PII indireto via lead_id). Admin/gerente apenas.
--    Consultor não toca esse fluxo; marketing também não (vazaria lead_id).
--    INSERT real vem do webhook backend (Drizzle/service_role, bypassa RLS).
-- ----------------------------------------------------------------------------
ALTER TABLE public.tracking_unknowns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS tracking_unknowns_admin_gerente_all ON public.tracking_unknowns;
CREATE POLICY tracking_unknowns_admin_gerente_all
ON public.tracking_unknowns FOR ALL TO authenticated
USING (public.current_user_perfil() = ANY(ARRAY['admin','gerente']))
WITH CHECK (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. lead_anotacoes — texto livre sobre o cliente (PII direto).
--    Replica o padrão de `leads` em db/policies.sql:
--      - admin/gerente: tudo (SELECT/INSERT/UPDATE/DELETE)
--      - consultor: SELECT/INSERT/UPDATE só nas anotações dos leads atribuídos
--      - consultor: NÃO pode DELETE (CLAUDE.md: "excluídas apenas pelo admin")
--      - marketing: nada (PII)
-- ----------------------------------------------------------------------------
ALTER TABLE public.lead_anotacoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- SELECT
DROP POLICY IF EXISTS lead_anotacoes_select_admin_gerente ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_select_admin_gerente
ON public.lead_anotacoes FOR SELECT TO authenticated
USING (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));
--> statement-breakpoint

DROP POLICY IF EXISTS lead_anotacoes_select_consultor ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_select_consultor
ON public.lead_anotacoes FOR SELECT TO authenticated
USING (
  public.current_user_perfil() = 'consultor'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_anotacoes.lead_id AND l.consultor_id = auth.uid()
  )
);
--> statement-breakpoint

-- INSERT
DROP POLICY IF EXISTS lead_anotacoes_insert_admin_gerente ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_insert_admin_gerente
ON public.lead_anotacoes FOR INSERT TO authenticated
WITH CHECK (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));
--> statement-breakpoint

DROP POLICY IF EXISTS lead_anotacoes_insert_consultor ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_insert_consultor
ON public.lead_anotacoes FOR INSERT TO authenticated
WITH CHECK (
  public.current_user_perfil() = 'consultor'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_anotacoes.lead_id AND l.consultor_id = auth.uid()
  )
);
--> statement-breakpoint

-- UPDATE
DROP POLICY IF EXISTS lead_anotacoes_update_admin_gerente ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_update_admin_gerente
ON public.lead_anotacoes FOR UPDATE TO authenticated
USING (public.current_user_perfil() = ANY(ARRAY['admin','gerente']))
WITH CHECK (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));
--> statement-breakpoint

DROP POLICY IF EXISTS lead_anotacoes_update_consultor ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_update_consultor
ON public.lead_anotacoes FOR UPDATE TO authenticated
USING (
  public.current_user_perfil() = 'consultor'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_anotacoes.lead_id AND l.consultor_id = auth.uid()
  )
)
WITH CHECK (
  public.current_user_perfil() = 'consultor'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_anotacoes.lead_id AND l.consultor_id = auth.uid()
  )
);
--> statement-breakpoint

-- DELETE: só admin. Gerente e consultor não excluem (CLAUDE.md §6.6).
DROP POLICY IF EXISTS lead_anotacoes_delete_admin ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_delete_admin
ON public.lead_anotacoes FOR DELETE TO authenticated
USING (public.current_user_perfil() = 'admin');
