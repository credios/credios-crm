import { and, eq, inArray } from "drizzle-orm";

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
 * O consultor assumiu o atendimento (registrou contato com o cliente ou mudou o
 * status manualmente) → o bot CEDE A VEZ: encerra a qualificação por WhatsApp
 * pra não conversar/ofertar horários por cima do atendimento humano (caso
 * Claudio/Geovana, auditoria de 2026-07-06). Se o cliente escrever depois, a
 * Heloísa dá o fecho padrão uma única vez e silencia.
 *
 * No-op quando o bot não está ativo: nunca abordou (null — o proativo segue
 * valendo), já concluiu, ou optout. Best-effort: nunca lança.
 */
export async function cederVezAoHumano(
  leadId: string,
  motivo: "contato_manual" | "status_manual",
): Promise<boolean> {
  try {
    const updated = await db
      .update(leads)
      .set({ qualifWhatsappStatus: "concluida", qualifWhatsappEm: new Date() })
      .where(
        and(eq(leads.id, leadId), inArray(leads.qualifWhatsappStatus, ESTADOS_BOT_ATIVO)),
      )
      .returning({ id: leads.id });
    if (updated.length === 0) return false;

    await db.insert(interacoes).values({
      leadId,
      autorId: null,
      tipo: "evento_sistema",
      conteudo:
        "Bot cedeu a vez: consultor assumiu o atendimento — a Heloísa não envia mais mensagens automáticas neste lead.",
      metadata: { canal: "whatsapp_ia", automatico: true, handoff: motivo } as never,
    });
    console.log(`[handoff] bot cedeu a vez no lead ${leadId} (${motivo})`);
    return true;
  } catch (e) {
    console.error("[handoff] falhou (não bloqueia a ação do consultor):", e);
    return false;
  }
}
