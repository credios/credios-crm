-- ============================================================================
-- Resolve 3 issues CRÍTICOS do Supabase Security Advisor:
--
-- 1. RLS Disabled in Public — public.status_lead_config
-- 2. RLS Disabled in Public — public.task_config_por_status
-- 3. Security Definer View — public.leads_marketing
--
-- Para 1+2: tabelas de configuração usadas pra renderizar UI (status do
-- funil, config de tarefas). Leitura liberada pra qualquer authenticated
-- (precisa pra montar Kanban, dropdown de status, etc); escrita só admin.
--
-- Para 3: a view leads_marketing está definida com `security_invoker = false`
-- (DEFINER), o que o Advisor flagga como risco. Verificamos que NÃO É USADA
-- por nenhum código TS no app — só existe nas migrations. PII masking pra
-- perfil marketing está previsto em CLAUDE.md mas ainda não foi implementado
-- em queries. Drop por hora; quando for adotado, fazemos como function
-- SECURITY DEFINER (pattern moderno aceito pelo advisor) ou recriamos a view
-- com `security_invoker = true` + policy específica.
-- ============================================================================

-- 1. status_lead_config — habilita RLS
ALTER TABLE public.status_lead_config ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS status_lead_config_select_authenticated ON public.status_lead_config;
CREATE POLICY status_lead_config_select_authenticated
ON public.status_lead_config FOR SELECT TO authenticated
USING (true);
--> statement-breakpoint

DROP POLICY IF EXISTS status_lead_config_admin_write ON public.status_lead_config;
CREATE POLICY status_lead_config_admin_write
ON public.status_lead_config FOR ALL TO authenticated
USING (public.current_user_perfil() = 'admin')
WITH CHECK (public.current_user_perfil() = 'admin');
--> statement-breakpoint

-- 2. task_config_por_status — mesmo padrão
ALTER TABLE public.task_config_por_status ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS task_config_por_status_select_authenticated ON public.task_config_por_status;
CREATE POLICY task_config_por_status_select_authenticated
ON public.task_config_por_status FOR SELECT TO authenticated
USING (true);
--> statement-breakpoint

DROP POLICY IF EXISTS task_config_por_status_admin_write ON public.task_config_por_status;
CREATE POLICY task_config_por_status_admin_write
ON public.task_config_por_status FOR ALL TO authenticated
USING (public.current_user_perfil() = 'admin')
WITH CHECK (public.current_user_perfil() = 'admin');
--> statement-breakpoint

-- 3. leads_marketing — drop. Não referenciada pelo código TS;
-- PII masking pra perfil marketing virá via function SECURITY DEFINER
-- quando for de fato implementado.
DROP VIEW IF EXISTS public.leads_marketing;
