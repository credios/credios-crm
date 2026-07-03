-- ================================================================
-- CRM Credios — RLS, view de mascaramento, helpers e triggers
-- Aplicar no Supabase Dashboard → SQL Editor após rodar a migration
-- 0000_useful_caretaker.sql.
-- Versão: 0001 (Fase 1)
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Helper functions
-- ----------------------------------------------------------------

-- Retorna o perfil do usuário autenticado atual.
-- INVOKER (default): roda com privilégios do caller. A policy
-- users_select_authenticated abaixo permite que qualquer authenticated
-- leia a tabela users, então isso funciona.
CREATE OR REPLACE FUNCTION public.current_user_perfil()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT perfil::text FROM public.users WHERE id = auth.uid()
$$;

-- ----------------------------------------------------------------
-- 2. Trigger functions (updated_at / atualizado_em)
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_set_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.users;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.leads;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.regras_roteamento;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.regras_roteamento
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_atualizado_em ON public.round_robin_estado;
CREATE TRIGGER set_atualizado_em
  BEFORE UPDATE ON public.round_robin_estado
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_atualizado_em();

DROP TRIGGER IF EXISTS set_updated_at ON public.tarefas;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_atualizado_em ON public.lead_bancos;
CREATE TRIGGER set_atualizado_em
  BEFORE UPDATE ON public.lead_bancos
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_atualizado_em();

-- ----------------------------------------------------------------
-- Auto-provisionamento de public.users em novo auth.users
-- ----------------------------------------------------------------
-- Quando alguém loga via Google (ou outro provider) com email novo, o
-- Supabase cria a row em auth.users. Sem provisionamento, getAppUser
-- retorna null e o app entra em loop de redirect. Trigger insere row
-- correspondente em public.users com perfil=consultor (default seguro).
-- Admin promove via SQL/UI conforme necessário.
--
-- ON CONFLICT (id) DO NOTHING permite que seed manual continue funcionando.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, nome, perfil, ativo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    'consultor',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ----------------------------------------------------------------
-- 3. Habilitar RLS em todas as tabelas
-- ----------------------------------------------------------------

ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interacoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regras_roteamento      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_estado     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_template     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicidades_pendentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_alertas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_bancos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log              ENABLE ROW LEVEL SECURITY;
-- webhook_idempotency: somente backend (service_role bypassa RLS).
-- Não criamos policies → nega tudo para anon/authenticated.
ALTER TABLE public.webhook_idempotency    ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 4. Policies — public.users
-- ----------------------------------------------------------------
-- Todo authenticated lê todos (UI mostra nome/avatar do consultor).
DROP POLICY IF EXISTS users_select_authenticated ON public.users;
CREATE POLICY users_select_authenticated
ON public.users FOR SELECT TO authenticated
USING (true);

-- Admin: full insert/update.
DROP POLICY IF EXISTS users_admin_insert ON public.users;
CREATE POLICY users_admin_insert
ON public.users FOR INSERT TO authenticated
WITH CHECK (current_user_perfil() = 'admin');

DROP POLICY IF EXISTS users_admin_update ON public.users;
CREATE POLICY users_admin_update
ON public.users FOR UPDATE TO authenticated
USING (current_user_perfil() = 'admin')
WITH CHECK (current_user_perfil() = 'admin');

-- Self-update de campos próprios (perfil precisa permanecer o mesmo).
DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self
ON public.users FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND perfil = (SELECT perfil FROM public.users WHERE id = auth.uid())
);

-- DELETE: ninguém. Desativar via ativo=false.

-- ----------------------------------------------------------------
-- 5. Policies — public.leads
-- ----------------------------------------------------------------

-- SELECT: admin/gerente todos; consultor só os atribuídos.
-- Marketing NÃO acessa esta tabela; usa a view leads_marketing.
DROP POLICY IF EXISTS leads_select_admin_gerente ON public.leads;
CREATE POLICY leads_select_admin_gerente
ON public.leads FOR SELECT TO authenticated
USING (current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS leads_select_consultor ON public.leads;
CREATE POLICY leads_select_consultor
ON public.leads FOR SELECT TO authenticated
USING (
  current_user_perfil() = 'consultor'
  AND consultor_id = auth.uid()
);

-- INSERT: admin, gerente, consultor (lead manual). Marketing não.
DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert
ON public.leads FOR INSERT TO authenticated
WITH CHECK (current_user_perfil() = ANY(ARRAY['admin','gerente','consultor']));

-- UPDATE: admin/gerente todos; consultor só os atribuídos.
DROP POLICY IF EXISTS leads_update_admin_gerente ON public.leads;
CREATE POLICY leads_update_admin_gerente
ON public.leads FOR UPDATE TO authenticated
USING (current_user_perfil() = ANY(ARRAY['admin','gerente']))
WITH CHECK (current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS leads_update_consultor ON public.leads;
CREATE POLICY leads_update_consultor
ON public.leads FOR UPDATE TO authenticated
USING (current_user_perfil() = 'consultor' AND consultor_id = auth.uid())
WITH CHECK (current_user_perfil() = 'consultor' AND consultor_id = auth.uid());

-- DELETE: ninguém no MVP. Sem policy → negado (RLS implícito).

-- ----------------------------------------------------------------
-- 6. View leads_marketing — masking de PII para perfil 'marketing'
-- ----------------------------------------------------------------
-- security_invoker = false (default explícito): a view roda como o owner
-- (postgres) e bypassa RLS de leads. O filtro WHERE garante que só rows
-- são retornados quando o caller tem perfil = 'marketing'. Outros perfis
-- recebem 0 rows da view (e usam a tabela leads direto com sua RLS).

CREATE OR REPLACE VIEW public.leads_marketing
WITH (security_invoker = false)
AS
SELECT
  id,
  nome,
  -- CPF: mostra apenas últimos 2 dígitos.
  CASE
    WHEN cpf IS NULL THEN NULL
    ELSE '***.***.***-' || RIGHT(REGEXP_REPLACE(cpf, '\D', '', 'g'), 2)
  END AS cpf,
  estado_civil,
  ocupacao,
  -- Renda: faixa em vez de valor exato. Centavos < 500_000 = R$ 5.000.
  CASE
    WHEN renda_mensal_centavos IS NULL THEN NULL
    WHEN renda_mensal_centavos <  500000  THEN 'Até R$ 5k'
    WHEN renda_mensal_centavos < 1000000  THEN 'R$ 5k–10k'
    WHEN renda_mensal_centavos < 2000000  THEN 'R$ 10k–20k'
    WHEN renda_mensal_centavos < 5000000  THEN 'R$ 20k–50k'
    ELSE                                       'Acima R$ 50k'
  END AS renda_faixa,
  -- WhatsApp: oculto.
  NULL::text AS whatsapp,
  -- Email: somente domínio.
  CASE
    WHEN email IS NULL THEN NULL
    ELSE '***@' || SPLIT_PART(email, '@', 2)
  END AS email,
  cidade,
  estado,
  produto,
  objetivo_credito,
  tipo_imovel,
  situacao_imovel,
  tipo_pessoa,
  valor_imovel_centavos,
  valor_credito_centavos,
  status,
  motivo_desqualificacao,
  consultor_id,
  atribuido_em,
  atribuido_por,
  origem,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_term,
  utm_content,
  gclid,
  rede,
  dispositivo,
  palavra_chave,
  grupo_anuncios,
  criativo,
  tipo_correspondencia,
  referrer,
  pagina_entrada,
  -- Dados financeiros: NULL para marketing.
  NULL::text   AS banco_aprovador,
  NULL::bigint AS valor_liberado_centavos,
  NULL::bigint AS comissao_centavos,
  data_fechamento,
  ultimo_contato,
  created_at,
  updated_at
FROM public.leads
WHERE current_user_perfil() = 'marketing';

REVOKE ALL ON public.leads_marketing FROM PUBLIC;
REVOKE ALL ON public.leads_marketing FROM anon;
GRANT SELECT ON public.leads_marketing TO authenticated;

-- ----------------------------------------------------------------
-- 7. Policies — public.interacoes
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS interacoes_select_admin_gerente ON public.interacoes;
CREATE POLICY interacoes_select_admin_gerente
ON public.interacoes FOR SELECT TO authenticated
USING (current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS interacoes_select_consultor ON public.interacoes;
CREATE POLICY interacoes_select_consultor
ON public.interacoes FOR SELECT TO authenticated
USING (
  current_user_perfil() = 'consultor'
  AND lead_id IN (SELECT id FROM public.leads WHERE consultor_id = auth.uid())
);

-- Marketing NÃO vê interações: texto livre pode conter PII (CPF, telefone,
-- banco, valores) que mascaramento de campos não cobre. Bloqueio TOTAL.
-- Defesa em profundidade — o app-layer já bloqueia em GET /api/leads/[id] e
-- na page de detalhe, mas RLS protege contra acessos via supabase-js cliente.
DROP POLICY IF EXISTS interacoes_select_marketing ON public.interacoes;
-- (sem CREATE — política removida deliberadamente).

-- INSERT: admin/gerente sempre; consultor só em leads próprios.
DROP POLICY IF EXISTS interacoes_insert_admin_gerente ON public.interacoes;
CREATE POLICY interacoes_insert_admin_gerente
ON public.interacoes FOR INSERT TO authenticated
WITH CHECK (current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS interacoes_insert_consultor ON public.interacoes;
CREATE POLICY interacoes_insert_consultor
ON public.interacoes FOR INSERT TO authenticated
WITH CHECK (
  current_user_perfil() = 'consultor'
  AND lead_id IN (SELECT id FROM public.leads WHERE consultor_id = auth.uid())
);

-- ----------------------------------------------------------------
-- 8. Policies — regras_roteamento e round_robin_estado (admin only)
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS regras_admin_all ON public.regras_roteamento;
CREATE POLICY regras_admin_all
ON public.regras_roteamento FOR ALL TO authenticated
USING (current_user_perfil() = 'admin')
WITH CHECK (current_user_perfil() = 'admin');

DROP POLICY IF EXISTS round_robin_admin_all ON public.round_robin_estado;
CREATE POLICY round_robin_admin_all
ON public.round_robin_estado FOR ALL TO authenticated
USING (current_user_perfil() = 'admin')
WITH CHECK (current_user_perfil() = 'admin');

-- ----------------------------------------------------------------
-- 9. Policies — mensagens_template (read all, admin write)
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS templates_select_authenticated ON public.mensagens_template;
CREATE POLICY templates_select_authenticated
ON public.mensagens_template FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS templates_admin_insert ON public.mensagens_template;
CREATE POLICY templates_admin_insert
ON public.mensagens_template FOR INSERT TO authenticated
WITH CHECK (current_user_perfil() = 'admin');

DROP POLICY IF EXISTS templates_admin_update ON public.mensagens_template;
CREATE POLICY templates_admin_update
ON public.mensagens_template FOR UPDATE TO authenticated
USING (current_user_perfil() = 'admin')
WITH CHECK (current_user_perfil() = 'admin');

DROP POLICY IF EXISTS templates_admin_delete ON public.mensagens_template;
CREATE POLICY templates_admin_delete
ON public.mensagens_template FOR DELETE TO authenticated
USING (current_user_perfil() = 'admin');

-- ----------------------------------------------------------------
-- 10. Policies — duplicidades_pendentes e sla_alertas (admin/gerente)
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS duplicidades_admin_gerente ON public.duplicidades_pendentes;
CREATE POLICY duplicidades_admin_gerente
ON public.duplicidades_pendentes FOR ALL TO authenticated
USING (current_user_perfil() = ANY(ARRAY['admin','gerente']))
WITH CHECK (current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS sla_alertas_admin_gerente ON public.sla_alertas;
CREATE POLICY sla_alertas_admin_gerente
ON public.sla_alertas FOR ALL TO authenticated
USING (current_user_perfil() = ANY(ARRAY['admin','gerente']))
WITH CHECK (current_user_perfil() = ANY(ARRAY['admin','gerente']));

-- ----------------------------------------------------------------
-- 11. Policies — audit_log (admin SELECT only)
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select
ON public.audit_log FOR SELECT TO authenticated
USING (current_user_perfil() = 'admin');

-- INSERT vem do backend (service_role bypassa RLS) — sem policy adicional.

-- ----------------------------------------------------------------
-- 12. Policies — tarefas
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS tarefas_select_admin_gerente ON public.tarefas;
CREATE POLICY tarefas_select_admin_gerente
ON public.tarefas FOR SELECT TO authenticated
USING (current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS tarefas_select_consultor ON public.tarefas;
CREATE POLICY tarefas_select_consultor
ON public.tarefas FOR SELECT TO authenticated
USING (
  current_user_perfil() = 'consultor'
  AND consultor_id = auth.uid()
);

DROP POLICY IF EXISTS tarefas_update_admin_gerente ON public.tarefas;
CREATE POLICY tarefas_update_admin_gerente
ON public.tarefas FOR UPDATE TO authenticated
USING (current_user_perfil() = ANY(ARRAY['admin','gerente']))
WITH CHECK (current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS tarefas_update_consultor ON public.tarefas;
CREATE POLICY tarefas_update_consultor
ON public.tarefas FOR UPDATE TO authenticated
USING (
  current_user_perfil() = 'consultor'
  AND consultor_id = auth.uid()
)
WITH CHECK (
  current_user_perfil() = 'consultor'
  AND consultor_id = auth.uid()
);

-- Criação de tarefas vem do backend/cron com DATABASE_URL.

-- ----------------------------------------------------------------
-- 13. Policies — lead_bancos
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS lead_bancos_select_admin_gerente ON public.lead_bancos;
CREATE POLICY lead_bancos_select_admin_gerente
ON public.lead_bancos FOR SELECT TO authenticated
USING (current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS lead_bancos_select_consultor ON public.lead_bancos;
CREATE POLICY lead_bancos_select_consultor
ON public.lead_bancos FOR SELECT TO authenticated
USING (
  current_user_perfil() = 'consultor'
  AND lead_id IN (SELECT id FROM public.leads WHERE consultor_id = auth.uid())
);

DROP POLICY IF EXISTS lead_bancos_select_marketing ON public.lead_bancos;
-- Marketing não acessa bancos/propostas: pode revelar estratégia, bancos e valores.

DROP POLICY IF EXISTS lead_bancos_insert_admin_gerente ON public.lead_bancos;
CREATE POLICY lead_bancos_insert_admin_gerente
ON public.lead_bancos FOR INSERT TO authenticated
WITH CHECK (current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS lead_bancos_insert_consultor ON public.lead_bancos;
CREATE POLICY lead_bancos_insert_consultor
ON public.lead_bancos FOR INSERT TO authenticated
WITH CHECK (
  current_user_perfil() = 'consultor'
  AND lead_id IN (SELECT id FROM public.leads WHERE consultor_id = auth.uid())
);

DROP POLICY IF EXISTS lead_bancos_update_admin_gerente ON public.lead_bancos;
CREATE POLICY lead_bancos_update_admin_gerente
ON public.lead_bancos FOR UPDATE TO authenticated
USING (current_user_perfil() = ANY(ARRAY['admin','gerente']))
WITH CHECK (current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS lead_bancos_update_consultor ON public.lead_bancos;
CREATE POLICY lead_bancos_update_consultor
ON public.lead_bancos FOR UPDATE TO authenticated
USING (
  current_user_perfil() = 'consultor'
  AND lead_id IN (SELECT id FROM public.leads WHERE consultor_id = auth.uid())
)
WITH CHECK (
  current_user_perfil() = 'consultor'
  AND lead_id IN (SELECT id FROM public.leads WHERE consultor_id = auth.uid())
);

COMMIT;

-- ================================================================
-- Notas operacionais
-- ================================================================
-- service_role bypassa RLS. Webhooks (/api/webhooks/lead), cron jobs
-- (/api/cron/sla-check) e seed.ts rodam com SUPABASE_SERVICE_ROLE_KEY
-- e ignoram estas policies. RLS aplica para frontend (anon + JWT).
--
-- Validação manual (SQL Editor do Supabase):
--
--   -- Como Gabriel (admin):
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claim.sub" = '<UUID DO GABRIEL>';
--   SELECT count(*) FROM public.leads;          -- vê tudo
--
--   -- Como Rodrigo (consultor):
--   SET LOCAL "request.jwt.claim.sub" = '<UUID DO RODRIGO>';
--   SELECT count(*) FROM public.leads;          -- só atribuídos
--   SELECT count(*) FROM public.audit_log;      -- 0 (negado)
--
--   -- Como hipotético usuário marketing:
--   SET LOCAL "request.jwt.claim.sub" = '<UUID DO MARKETING>';
--   SELECT count(*) FROM public.leads;          -- 0 (sem policy)
--   SELECT cpf, renda_faixa FROM public.leads_marketing;  -- mascarado

-- ============================================================================
-- 12. Constraints e índices sincronizados com a aplicação
--
-- Alguns constraints precisam existir para o app funcionar correto (ON
-- CONFLICT em UPSERTs, índices únicos parciais para evitar duplicação em
-- concorrência). Mantidos AQUI (não em drizzle migrations) porque:
--   - drizzle não suporta unique parcial (WHERE) bem
--   - ficam idempotentes via IF NOT EXISTS
--   - documentam claramente o motivo
-- ============================================================================

-- round_robin_estado: garante 1 linha por regra_id pra UPSERT atômico no
-- pickNextRoundRobin (evita race condition no primeiro uso da regra).
CREATE UNIQUE INDEX IF NOT EXISTS round_robin_estado_regra_id_key
  ON public.round_robin_estado (regra_id);

-- sla_alertas: índice único parcial para "alertas ativos" — evita duas
-- requests do cron criarem 2 alertas pro mesmo (lead, tipo) quando ambos
-- ainda estão sem resolvido_em. Permite múltiplos alertas históricos
-- (resolvidos) pro mesmo par.
CREATE UNIQUE INDEX IF NOT EXISTS sla_alertas_unico_ativo
  ON public.sla_alertas (lead_id, tipo)
  WHERE resolvido_em IS NULL;

-- ============================================================================
-- 13. Índices compostos para relatórios e queries quentes
--
-- Adicionados pra escalar sem materialized views nas queries mais frequentes:
--   - Relatórios por período + status / consultor / data_fechamento
--   - SLA dedupe parcial já criado acima (sla_alertas_unico_ativo)
--   - Lookup de interações por lead+tipo+data (timeline)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_created_status
  ON public.leads (created_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_leads_consultor_created
  ON public.leads (consultor_id, created_at DESC)
  WHERE consultor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_data_fechamento
  ON public.leads (data_fechamento DESC)
  WHERE data_fechamento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_atribuido_em
  ON public.leads (atribuido_em DESC)
  WHERE atribuido_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interacoes_lead_tipo_criado
  ON public.interacoes (lead_id, tipo, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_sla_alertas_lead_tipo_resolvido
  ON public.sla_alertas (lead_id, tipo, resolvido_em);

-- tarefas: uma única tarefa ativa por lead (evita funil poluído) e uma única
-- tarefa por lead/dia (evita duplicidade no cron diário).
CREATE UNIQUE INDEX IF NOT EXISTS tarefas_lead_ativa_unica
  ON public.tarefas (lead_id)
  WHERE status IN ('aberta', 'atrasada');

CREATE UNIQUE INDEX IF NOT EXISTS tarefas_lead_dia_unica
  ON public.tarefas (lead_id, data_referencia);

CREATE UNIQUE INDEX IF NOT EXISTS lead_bancos_lead_banco_unico
  ON public.lead_bancos (lead_id, banco);

-- ================================================================
-- RLS pós-canonical: tabelas adicionadas após a versão original deste
-- arquivo. Mantido aqui pra `npm run db:policies` ser self-contained.
-- Migrations correspondentes:
--   - 0009_security_advisor_fixes: status_lead_config + task_config_por_status
--   - 0024_rls_tracking_anotacoes: as 4 tabelas abaixo
-- ================================================================

-- status_lead_config (0009) --------------------------------------------------
ALTER TABLE public.status_lead_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS status_lead_config_select_authenticated ON public.status_lead_config;
CREATE POLICY status_lead_config_select_authenticated
ON public.status_lead_config FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS status_lead_config_admin_write ON public.status_lead_config;
CREATE POLICY status_lead_config_admin_write
ON public.status_lead_config FOR ALL TO authenticated
USING (public.current_user_perfil() = 'admin')
WITH CHECK (public.current_user_perfil() = 'admin');

-- task_config_por_status (0009) ----------------------------------------------
ALTER TABLE public.task_config_por_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_config_por_status_select_authenticated ON public.task_config_por_status;
CREATE POLICY task_config_por_status_select_authenticated
ON public.task_config_por_status FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS task_config_por_status_admin_write ON public.task_config_por_status;
CREATE POLICY task_config_por_status_admin_write
ON public.task_config_por_status FOR ALL TO authenticated
USING (public.current_user_perfil() = 'admin')
WITH CHECK (public.current_user_perfil() = 'admin');

-- tracking_sources (0024) ----------------------------------------------------
ALTER TABLE public.tracking_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_sources_select_authenticated ON public.tracking_sources;
CREATE POLICY tracking_sources_select_authenticated
ON public.tracking_sources FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS tracking_sources_admin_write ON public.tracking_sources;
CREATE POLICY tracking_sources_admin_write
ON public.tracking_sources FOR ALL TO authenticated
USING (public.current_user_perfil() = 'admin')
WITH CHECK (public.current_user_perfil() = 'admin');

-- tracking_source_aliases (0024) ---------------------------------------------
ALTER TABLE public.tracking_source_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_source_aliases_select_authenticated ON public.tracking_source_aliases;
CREATE POLICY tracking_source_aliases_select_authenticated
ON public.tracking_source_aliases FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS tracking_source_aliases_admin_write ON public.tracking_source_aliases;
CREATE POLICY tracking_source_aliases_admin_write
ON public.tracking_source_aliases FOR ALL TO authenticated
USING (public.current_user_perfil() = 'admin')
WITH CHECK (public.current_user_perfil() = 'admin');

-- tracking_unknowns (0024) ---------------------------------------------------
ALTER TABLE public.tracking_unknowns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_unknowns_admin_gerente_all ON public.tracking_unknowns;
CREATE POLICY tracking_unknowns_admin_gerente_all
ON public.tracking_unknowns FOR ALL TO authenticated
USING (public.current_user_perfil() = ANY(ARRAY['admin','gerente']))
WITH CHECK (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));

-- lead_anotacoes (0024) ------------------------------------------------------
ALTER TABLE public.lead_anotacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_anotacoes_select_admin_gerente ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_select_admin_gerente
ON public.lead_anotacoes FOR SELECT TO authenticated
USING (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));

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

DROP POLICY IF EXISTS lead_anotacoes_insert_admin_gerente ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_insert_admin_gerente
ON public.lead_anotacoes FOR INSERT TO authenticated
WITH CHECK (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));

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

DROP POLICY IF EXISTS lead_anotacoes_update_admin_gerente ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_update_admin_gerente
ON public.lead_anotacoes FOR UPDATE TO authenticated
USING (public.current_user_perfil() = ANY(ARRAY['admin','gerente']))
WITH CHECK (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));

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

DROP POLICY IF EXISTS lead_anotacoes_delete_admin ON public.lead_anotacoes;
CREATE POLICY lead_anotacoes_delete_admin
ON public.lead_anotacoes FOR DELETE TO authenticated
USING (public.current_user_perfil() = 'admin');

-- ================================================================
-- 0038_rls_portal_gads_reunioes: Security Advisor 28 Jun 2026
-- (rls_disabled_in_public nas tabelas das migrations 0031/0034/0035)
-- ================================================================

-- lead_portal_tokens (0038) — hash de tokens do portal público. Resolução é
-- 100% server-side (src/lib/portal/token.ts); nenhum acesso via PostgREST é
-- legítimo. RLS sem policy = deny total (mesmo padrão de webhook_idempotency).
ALTER TABLE public.lead_portal_tokens ENABLE ROW LEVEL SECURITY;

-- google_ads_conversions (0038) — fila de conversões offline, só backend/cron.
ALTER TABLE public.google_ads_conversions ENABLE ROW LEVEL SECURITY;

-- lead_documentos (0038) — metadado de docs do lead (PII). Leitura espelha o
-- modelo de permissão; escritas são 100% server-side (portal + API).
ALTER TABLE public.lead_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_documentos_select_admin_gerente ON public.lead_documentos;
CREATE POLICY lead_documentos_select_admin_gerente
ON public.lead_documentos FOR SELECT TO authenticated
USING (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));

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

-- reunioes (0038) — agenda SDR. Leitura no padrão de tarefas (consultor só as
-- próprias); escritas só backend SDR.
ALTER TABLE public.reunioes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reunioes_select_admin_gerente ON public.reunioes;
CREATE POLICY reunioes_select_admin_gerente
ON public.reunioes FOR SELECT TO authenticated
USING (public.current_user_perfil() = ANY(ARRAY['admin','gerente']));

DROP POLICY IF EXISTS reunioes_select_consultor ON public.reunioes;
CREATE POLICY reunioes_select_consultor
ON public.reunioes FOR SELECT TO authenticated
USING (
  public.current_user_perfil() = 'consultor'
  AND consultor_id = auth.uid()
);
