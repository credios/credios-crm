import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";

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
 * reverte o status pra permitir nova tentativa. Retorna `{ sent }` true só se
 * enviou; em falha de ENVIO, `error` traz o motivo do Meta (pra alerta/diagnóstico).
 *
 * Usado por: webhook de lead (na CONCLUSÃO da simulação) e cron (fallback de
 * 15 min pra quem deu o WhatsApp mas não concluiu).
 */
export async function enviarProativoWhatsapp(opts: {
  leadId: string;
  nome: string | null;
  whatsapp: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  if (!opts.whatsapp) return { sent: false };
  const to = opts.whatsapp.replace(/\D/g, "");
  if (to.length < 10) return { sent: false };
  const primeiroNome = opts.nome ? opts.nome.split(/\s+/)[0] : "";

  // GUARD DE ATENDIMENTO HUMANO (regra do owner, 17/07/2026 — caso Adriano):
  // qualquer digital humano no lead (interação com autor: contato registrado,
  // mudança manual de status, reatribuição, anotação, proposta gerada) =
  // alguém JÁ está atendendo → a Heloísa não abre conversa por cima. Sela o
  // claim como "concluida" pro cron não reprocessar. Cinto e suspensório com
  // cederVezAoHumano (que age na hora da ação manual); este guard cobre
  // qualquer caminho novo/esquecido no último instante antes do envio.
  const humano = await db
    .select({ id: interacoes.id })
    .from(interacoes)
    .where(and(eq(interacoes.leadId, opts.leadId), isNotNull(interacoes.autorId)))
    .limit(1);
  if (humano.length > 0) {
    const sealed = await db
      .update(leads)
      .set({ qualifWhatsappStatus: "concluida", qualifWhatsappEm: new Date() })
      .where(and(eq(leads.id, opts.leadId), isNull(leads.qualifWhatsappStatus)))
      .returning({ id: leads.id });
    if (sealed.length > 0) {
      await db.insert(interacoes).values({
        leadId: opts.leadId,
        autorId: null,
        tipo: "evento_sistema",
        conteudo:
          "Abertura automática da Heloísa suprimida: lead já em atendimento manual.",
        metadata: { kind: "proativo_suprimido_humano" } as never,
      });
      console.log("[proativo] suprimido — atendimento humano no lead " + opts.leadId);
    }
    return { sent: false };
  }

  // Não reabre conversa proativa num número que JÁ está em conversa com a Heloísa
  // (outro lead com o mesmo telefone, qualif já setado). WhatsApp é uma thread por
  // número — re-simulação cria lead novo no mesmo número e dispararia a abertura de
  // novo pra quem acabou de agendar/conversar. Aqui a gente segura.
  const last8 = to.slice(-8);
  const emConversa = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        sql`regexp_replace(${leads.whatsapp}, '[^0-9]', '', 'g') LIKE ${"%" + last8}`,
        ne(leads.id, opts.leadId),
        isNotNull(leads.qualifWhatsappStatus),
      ),
    )
    .limit(1);
  if (emConversa.length > 0) {
    console.log("[proativo] número já em conversa (outro lead) — não reabre: ***" + to.slice(-4));
    return { sent: false };
  }

  const claimed = await db
    .update(leads)
    .set({ qualifWhatsappStatus: "template_enviado" })
    .where(and(eq(leads.id, opts.leadId), isNull(leads.qualifWhatsappStatus)))
    .returning({ id: leads.id });
  // Sem claim = outra execução (cron/webhook) já pegou esse lead. Não é erro.
  if (claimed.length === 0) return { sent: false };

  try {
    const { ok, error, id } = await enviarTemplateWhatsApp(
      to,
      TEMPLATE_PROATIVO,
      TEMPLATE_PROATIVO_LANG,
      [primeiroNome],
    );
    if (!ok) throw new Error(error ?? "template não aceito pelo Meta");
    await db.insert(interacoes).values({
      leadId: opts.leadId,
      autorId: null,
      tipo: "whatsapp_enviado",
      conteudo: aberturaProativa(primeiroNome),
      // wamid: id da msg no Meta — chave pra casar o status de ENTREGA depois.
      metadata: { canal: "whatsapp_ia", automatico: true, proativo: true, wamid: id ?? null } as never,
    });
    console.log("[proativo] template enviado pra ***" + to.slice(-4));
    return { sent: true };
  } catch (e) {
    console.error("[proativo] falhou — revertendo status:", e);
    await db
      .update(leads)
      .set({ qualifWhatsappStatus: null })
      .where(eq(leads.id, opts.leadId));
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
