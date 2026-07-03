-- Security Advisor (28 Jun 2026): "Table publicly accessible — rls_disabled_in_public".
-- Habilita RLS nas 4 tabelas criadas pelas migrations 0031/0034/0035, que ficaram
-- sem a proteção. Sem RLS, qualquer pessoa com a NEXT_PUBLIC_SUPABASE_ANON_KEY
-- (exposta no bundle do browser) lê/edita/apaga essas tabelas via PostgREST.
--
-- Mesmo racional da migration 0024: o app acessa o banco via Drizzle como role
-- owner (DATABASE_URL), que bypassa RLS — nada muda nos fluxos do app. Isto só
-- fecha o vetor público. Idempotente: aplicado em prod via pooler; este arquivo
-- é o registro p/ fresh setup.
--
-- Decisões por tabela:
--   lead_portal_tokens     — hash de tokens do portal público. Nenhum acesso via
--                            PostgREST é legítimo (resolução de token é 100%
--                            server-side em src/lib/portal/token.ts). RLS sem
--                            policy = deny total, como webhook_idempotency.
--   google_ads_conversions — fila de conversões offline, só backend/cron. Idem.
--   lead_documentos        — metadado de docs do lead (PII). Leitura espelha o
--                            modelo de permissão (admin/gerente tudo; consultor
--                            só dos leads atribuídos; marketing nada). Escritas
--                            são 100% server-side (upload do portal, exclusão
--                            via API) — sem policy de escrita.
--   reunioes               — agenda SDR (lead_id + meet_link). Leitura: admin/
--                            gerente tudo; consultor só as próprias (mesmo
--                            padrão de tarefas). Escritas só backend SDR.

-- ----------------------------------------------------------------------------
-- 1. lead_portal_tokens — deny total via PostgREST
-- ----------------------------------------------------------------------------
ALTER TABLE public.lead_portal_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. google_ads_conversions — deny total via PostgREST
-- ----------------------------------------------------------------------------
ALTER TABLE public.google_ads_conversions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. lead_documentos — SELECT espelhando o modelo de permissão
-- ----------------------------------------------------------------------------
ALTER TABLE public.lead_documentos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS lead_documentos_select_admin_gerente ON public.lead_documentos;
CREATE POLICY lead_documentos_select_admin_gerente
ON public.lead_documentos FOR SELECT TO authenticated
USING (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));
--> statement-breakpoint

DROP POLICY IF EXISTS lead_documentos_select_consultor ON public.lead_documentos;
CREATE POLICY lead_documentos_select_consultor
ON public.lead_documentos FOR SELECT TO authenticated
USING (
  public.current_user_perfil() = 'consultor'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_documentos.lead_id AND l.consultor_id = auth.uid()
  )
);
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. reunioes — SELECT espelhando o padrão de tarefas
-- ----------------------------------------------------------------------------
ALTER TABLE public.reunioes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS reunioes_select_admin_gerente ON public.reunioes;
CREATE POLICY reunioes_select_admin_gerente
ON public.reunioes FOR SELECT TO authenticated
USING (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));
--> statement-breakpoint

DROP POLICY IF EXISTS reunioes_select_consultor ON public.reunioes;
CREATE POLICY reunioes_select_consultor
ON public.reunioes FOR SELECT TO authenticated
USING (
  public.current_user_perfil() = 'consultor'
  AND consultor_id = auth.uid()
);
