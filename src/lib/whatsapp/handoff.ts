import { and, eq, inArray, isNull } from "drizzle-orm";

import { interacoes, leads } from "../../../db/schema";
import { db } from "@/lib/db";

/**
 * Estados em que o bot está ATIVO numa conversa — pode voltar a falar sozinho
 * (continuar a qualificação, ofertar horários, negociar remarcação).
 */
const ESTADOS_BOT_ATIVO = [
  "template_enviado",
  "em_andamento",
  "agendando",
  "remarcando",
];

/**
 * O consultor assumiu o atendimento (registrou contato, mudou o status ou
 * reatribuiu o lead manualmente) → o bot CEDE A VEZ: encerra a qualificação
 * por WhatsApp pra não conversar/ofertar horários por cima do atendimento
 * humano (caso Claudio/Geovana, auditoria de 2026-07-06). Se o cliente
 * escrever depois, a Heloísa dá o fecho padrão uma única vez e silencia.
 *
 * PREEMPTIVO desde 17/07/2026 (caso Adriano): se a Heloísa ainda NEM abordou
 * (status null), a ação manual também sela o lead como "concluida" — o
 * proativo (webhook/cron) encontra o claim ocupado e nunca dispara. Cliente
 * atendido por humano não recebe abertura automática depois.
 *
 * No-op só quando já concluiu ou optout. Best-effort: nunca lança.
 */
export async function cederVezAoHumano(
  leadId: string,
  motivo: "contato_manual" | "status_manual" | "atribuicao_manual",
): Promise<boolean> {
  try {
    // 1ª tentativa: bot ATIVO em conversa → cede a vez.
    const updated = await db
      .update(leads)
      .set({ qualifWhatsappStatus: "concluida", qualifWhatsappEm: new Date() })
      .where(
        and(eq(leads.id, leadId), inArray(leads.qualifWhatsappStatus, ESTADOS_BOT_ATIVO)),
      )
      .returning({ id: leads.id });

    // 2ª tentativa: bot nunca abordou (null) → supressão preemptiva do proativo.
    let preemptivo = false;
    if (updated.length === 0) {
      const claimed = await db
        .update(leads)
        .set({ qualifWhatsappStatus: "concluida", qualifWhatsappEm: new Date() })
        .where(and(eq(leads.id, leadId), isNull(leads.qualifWhatsappStatus)))
        .returning({ id: leads.id });
      if (claimed.length === 0) return false; // já concluida/optout
      preemptivo = true;
    }

    await db.insert(interacoes).values({
      leadId,
      autorId: null,
      tipo: "evento_sistema",
      conteudo: preemptivo
        ? "Heloísa não vai abordar este lead: atendimento manual em curso — abertura automática suprimida."
        : "Bot cedeu a vez: consultor assumiu o atendimento — a Heloísa não envia mais mensagens automáticas neste lead.",
      metadata: { canal: "whatsapp_ia", automatico: true, handoff: motivo, preemptivo } as never,
    });
    console.log(`[handoff] bot cedeu a vez no lead ${leadId} (${motivo})`);
    return true;
  } catch (e) {
    console.error("[handoff] falhou (não bloqueia a ação do consultor):", e);
    return false;
  }
}
