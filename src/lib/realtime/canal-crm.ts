"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * Canais privados de Broadcast do CRM (migration 0056).
 *
 * Substituem as assinaturas `postgres_changes`, que obrigavam o Supabase
 * Realtime a varrer o log de alterações do banco sem parar. Agora o próprio
 * banco publica o evento (trigger → realtime.send) e só ouve quem passa na
 * política `crm_pode_ouvir_canal`.
 *
 * Canais: `crm:leads` (eventos "lead" e "interacao", só ids) e
 * `crm:lead:<id>` (eventos "interacao" e "anotacao", com a linha).
 *
 * Vários componentes ouvem o mesmo canal ao mesmo tempo (sininho + lista;
 * timeline + anotações). O supabase-js devolve o MESMO objeto de canal pro
 * mesmo tópico, então aqui existe uma assinatura por canal, compartilhada,
 * que só é removida quando o último ouvinte sai.
 */

type Ouvinte = (evento: string, payload: Record<string, unknown>) => void;
type OuvinteStatus = (conectado: boolean) => void;

type Assinatura = {
  ouvintes: Set<Ouvinte>;
  ouvintesStatus: Set<OuvinteStatus>;
  conectado: boolean;
  channel: RealtimeChannel | null;
  encerrada: boolean;
};

const assinaturas = new Map<string, Assinatura>();

function abrir(canal: string): Assinatura {
  const a: Assinatura = {
    ouvintes: new Set(),
    ouvintesStatus: new Set(),
    conectado: false,
    channel: null,
    encerrada: false,
  };
  const supabase = createClient();
  void (async () => {
    // Canal privado exige o JWT da sessão no socket do Realtime.
    await supabase.realtime.setAuth();
    if (a.encerrada) return;
    a.channel = supabase
      .channel(canal, { config: { private: true } })
      .on("broadcast", { event: "*" }, (msg) => {
        const payload = (msg.payload ?? {}) as Record<string, unknown>;
        for (const o of a.ouvintes) o(msg.event, payload);
      })
      .subscribe((status) => {
        a.conectado = status === "SUBSCRIBED";
        for (const o of a.ouvintesStatus) o(a.conectado);
      });
  })();
  return a;
}

/** Assina um canal. Retorna a função de cancelamento (cleanup do useEffect). */
export function assinarCanalCrm(
  canal: string,
  onEvento: Ouvinte,
  onStatus?: OuvinteStatus,
): () => void {
  let a = assinaturas.get(canal);
  if (!a) {
    a = abrir(canal);
    assinaturas.set(canal, a);
  }
  a.ouvintes.add(onEvento);
  if (onStatus) {
    a.ouvintesStatus.add(onStatus);
    onStatus(a.conectado);
  }

  const assinatura = a;
  return () => {
    assinatura.ouvintes.delete(onEvento);
    if (onStatus) assinatura.ouvintesStatus.delete(onStatus);
    if (assinatura.ouvintes.size > 0) return;
    assinatura.encerrada = true;
    assinaturas.delete(canal);
    if (assinatura.channel) void createClient().removeChannel(assinatura.channel);
  };
}
