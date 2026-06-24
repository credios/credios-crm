import { and, eq, isNull } from "drizzle-orm";

import { interacoes, leads } from "../../../db/schema";
import { db } from "@/lib/db";
import { enviarTemplateWhatsApp } from "@/lib/whatsapp/meta";

// Template aprovado (WABA) que abre a conversa proativa da Heloísa.
// Variável {{1}} = primeiro nome. Botões: "Confirmar" / "Agora não".
const TEMPLATE_PROATIVO = "novo_modelo_do_whatsapp_22_06_2026_14_55_ja7gtf";
const TEMPLATE_PROATIVO_LANG = "pt_BR";

/** Texto da abertura proativa — espelha o corpo do template aprovado. */
export function aberturaProativa(primeiroNome: string): string {
  return `Oi${primeiroNome ? `, ${primeiroNome}` : ""}! Aqui é a Credios 👋 Recebemos o seu pedido de simulação de crédito com garantia de imóvel. Posso confirmar alguns dados rapidinho pra agilizar a sua proposta? É gratuito e sem compromisso.`;
}

/**
 * Claim atômico + envio do template proativo da Heloísa. Idempotente: marca o
 * status e só envia se ganhou a corrida (qualif_whatsapp_status era null) — evita
 * disparo duplo entre webhooks concorrentes e o cron. Registra a abertura como
 * turno da Heloísa pra ela continuar de onde o template parou. Em falha de envio,
 * reverte o status pra permitir nova tentativa. Retorna true só se enviou.
 *
 * Usado por: webhook de lead (na CONCLUSÃO da simulação) e cron (fallback de
 * 15 min pra quem deu o WhatsApp mas não concluiu).
 */
export async function enviarProativoWhatsapp(opts: {
  leadId: string;
  nome: string | null;
  whatsapp: string | null;
}): Promise<boolean> {
  if (!opts.whatsapp) return false;
  const to = opts.whatsapp.replace(/\D/g, "");
  if (to.length < 10) return false;
  const primeiroNome = opts.nome ? opts.nome.split(/\s+/)[0] : "";

  const claimed = await db
    .update(leads)
    .set({ qualifWhatsappStatus: "template_enviado" })
    .where(and(eq(leads.id, opts.leadId), isNull(leads.qualifWhatsappStatus)))
    .returning({ id: leads.id });
  if (claimed.length === 0) return false;

  try {
    const { ok } = await enviarTemplateWhatsApp(
      to,
      TEMPLATE_PROATIVO,
      TEMPLATE_PROATIVO_LANG,
      [primeiroNome],
    );
    if (!ok) throw new Error("template não aceito pelo Meta");
    await db.insert(interacoes).values({
      leadId: opts.leadId,
      autorId: null,
      tipo: "whatsapp_enviado",
      conteudo: aberturaProativa(primeiroNome),
      metadata: { canal: "whatsapp_ia", automatico: true, proativo: true } as never,
    });
    console.log("[proativo] template enviado pra", to);
    return true;
  } catch (e) {
    console.error("[proativo] falhou — revertendo status:", e);
    await db
      .update(leads)
      .set({ qualifWhatsappStatus: null })
      .where(eq(leads.id, opts.leadId));
    return false;
  }
}
