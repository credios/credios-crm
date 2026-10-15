-- Tempo real via Broadcast a partir do banco (2026-10-15).
-- Idempotente. APLICAR ANTES do deploy do código que usa estes canais.
--
-- Por quê: as assinaturas `postgres_changes` (sininho em toda página, lista,
-- kanban, timeline) fazem o Supabase Realtime varrer o log de alterações do
-- banco sem parar — ~16 mi de chamadas e ~84 mil segundos de CPU desde maio,
-- a maior carga do banco. Com Broadcast, o próprio banco publica só o evento
-- que interessa, na hora da escrita, e ninguém precisa varrer nada.
--
-- Canais (todos privados — exigem login e passam pela política abaixo):
--   crm:leads        lead criado/alterado/excluído e interação nova.
--                    Payload só com ids — sem dado pessoal.
--   crm:lead:<uuid>  interações e anotações de UM lead, com a linha inteira
--                    (alimenta a timeline e as anotações ao vivo). Só ouve
--                    quem pode ver aquele lead.

-- 1. Quem pode ouvir cada canal. SECURITY DEFINER: a política roda como
--    `authenticated`, que não tem leitura direta em users/leads.
CREATE OR REPLACE FUNCTION public.crm_pode_ouvir_canal(canal text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  u record;
  lead_id uuid;
BEGIN
  SELECT perfil::text AS perfil, ativo INTO u
  FROM public.users WHERE id = auth.uid();
  IF NOT FOUND OR NOT u.ativo THEN
    RETURN false;
  END IF;

  IF canal = 'crm:leads' THEN
    RETURN true;
  END IF;

  IF canal ~ '^crm:lead:[0-9a-f-]{36}$' THEN
    -- Timeline e anotações: marketing não vê as telas operacionais (§5).
    IF u.perfil IN ('admin', 'gerente') THEN
      RETURN true;
    END IF;
    IF u.perfil = 'consultor' THEN
      lead_id := substring(canal FROM 10)::uuid;
      RETURN EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id AND l.consultor_id = auth.uid()
      );
    END IF;
  END IF;

  RETURN false;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.crm_pode_ouvir_canal(text) FROM public, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.crm_pode_ouvir_canal(text) TO authenticated;--> statement-breakpoint

DROP POLICY IF EXISTS "crm_broadcast_leitura" ON realtime.messages;--> statement-breakpoint
CREATE POLICY "crm_broadcast_leitura" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND public.crm_pode_ouvir_canal(realtime.topic())
  );--> statement-breakpoint

-- 2. Publicação. realtime.send(payload, evento, canal, privado).
--    Falhar em publicar NUNCA pode derrubar a escrita do CRM: erro vira aviso.
CREATE OR REPLACE FUNCTION public.crm_broadcast_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('id', COALESCE(NEW.id, OLD.id), 'op', TG_OP),
      'lead', 'crm:leads', true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'crm_broadcast_lead: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.crm_broadcast_interacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('id', NEW.id, 'lead_id', NEW.lead_id, 'op', TG_OP),
      'interacao', 'crm:leads', true
    );
    PERFORM realtime.send(
      to_jsonb(NEW), 'interacao', 'crm:lead:' || NEW.lead_id::text, true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'crm_broadcast_interacao: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.crm_broadcast_anotacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linha public.lead_anotacoes;
BEGIN
  linha := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('op', TG_OP, 'row', to_jsonb(linha)),
      'anotacao', 'crm:lead:' || linha.lead_id::text, true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'crm_broadcast_anotacao: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.crm_broadcast_lead() FROM public, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.crm_broadcast_interacao() FROM public, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.crm_broadcast_anotacao() FROM public, anon, authenticated;--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_crm_broadcast_lead ON public.leads;--> statement-breakpoint
CREATE TRIGGER trg_crm_broadcast_lead
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_broadcast_lead();--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_crm_broadcast_interacao ON public.interacoes;--> statement-breakpoint
CREATE TRIGGER trg_crm_broadcast_interacao
  AFTER INSERT ON public.interacoes
  FOR EACH ROW EXECUTE FUNCTION public.crm_broadcast_interacao();--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_crm_broadcast_anotacao ON public.lead_anotacoes;--> statement-breakpoint
CREATE TRIGGER trg_crm_broadcast_anotacao
  AFTER INSERT OR UPDATE OR DELETE ON public.lead_anotacoes
  FOR EACH ROW EXECUTE FUNCTION public.crm_broadcast_anotacao();
