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

-- Marketing também vê interações (sem mascaramento extra — texto livre é benigno).
DROP POLICY IF EXISTS interacoes_select_marketing ON public.interacoes;
CREATE POLICY interacoes_select_marketing
ON public.interacoes FOR SELECT TO authenticated
USING (current_user_perfil() = 'marketing');

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
