import "server-only";

import { and, desc, eq, gt } from "drizzle-orm";

import { interacoes, leads as leadsTable, reunioes } from "../../../db/schema";
import { db } from "@/lib/db";
import { sendNaoSeguiremosEmail } from "@/lib/notifications/email";
import { cancelarReuniao } from "@/lib/sdr/agendar";
import { enviarTextoWhatsApp } from "@/lib/whatsapp/meta";

// Efeitos de ENCERRAMENTO de lead (desqualificado/perdido) sobre reuniões e
// comunicação com o cliente:
//   - perdido E desqualificado: reuniões FUTURAS são canceladas (Google +
//     CRM) — sem isso o evento ficava vivo na agenda e os lembretes de
//     30/15 min disparavam pra um lead já encerrado.
//   - só desqualificado: o cliente é avisado com educação — WhatsApp pela
//     Heloísa (se a janela de 24h estiver aberta) E e-mail (backup, layout
//     de cliente). A mensagem é marcada como aviso de desqualificação, o que
//     SILENCIA o bot dali em diante (padrão jaAvisouDesqualificado).

const JANELA_24H_MS = 24 * 60 * 60 * 1000;

function primeiroNome(nome: string | null): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

function msgNaoSeguiremos(nome: string | null, tinhaReuniao: boolean): string {
  const p = primeiroNome(nome);
  return [
    `Oi${p ? `, ${p}` : ""}! Aqui é a Heloísa, da Credios 🙂`,
    `Nossa equipe analisou o seu caso com carinho e, neste momento, não vamos conseguir avançar com a sua operação de crédito com garantia de imóvel.${tinhaReuniao ? " A conversa que estava marcada já foi cancelada — você não precisa fazer nada." : ""}`,
    "Sabemos que isso pode mudar com o tempo. Se a sua situação se transformar lá na frente, vai ser um prazer olhar o seu caso de novo. Obrigada pela confiança! 🙏",
  ].join("\n\n");
}

async function janela24hAberta(leadId: string): Promise<boolean> {
  const [ult] = await db
    .select({ criadoEm: interacoes.criadoEm })
    .from(interacoes)
    .where(and(eq(interacoes.leadId, leadId), eq(interacoes.tipo, "whatsapp_recebido")))
    .orderBy(desc(interacoes.criadoEm))
    .limit(1);
  return !!ult && Date.now() - ult.criadoEm.getTime() < JANELA_24H_MS;
}

type LeadRow = typeof leadsTable.$inferSelect;

/**
 * Chamar DEPOIS do update de status. Best-effort de ponta a ponta: nenhuma
 * falha aqui pode desfazer o encerramento do lead.
 */
export async function aoEncerrarLead(
  lead: LeadRow,
  novoStatus: "perdido" | "desqualificado",
): Promise<void> {
  // 1) Cancela reuniões FUTURAS abertas (Google + CRM + timeline).
  let tinhaReuniao = false;
  try {
    const futuras = await db
      .select({ id: reunioes.id, inicio: reunioes.inicio })
      .from(reunioes)
      .where(
        and(
          eq(reunioes.leadId, lead.id),
          eq(reunioes.status, "agendada"),
          gt(reunioes.inicio, new Date()),
        ),
      );
    for (const r of futuras) {
      await cancelarReuniao(r.id);
      tinhaReuniao = true;
      await db.insert(interacoes).values({
        leadId: lead.id,
        autorId: null,
        tipo: "evento_sistema",
        conteudo: `Reunião cancelada automaticamente — lead ${novoStatus}.`,
        metadata: { reuniaoId: r.id, encerramento: novoStatus } as never,
      });
    }
  } catch (e) {
    console.error("[encerramento] cancelar reuniões falhou:", e);
  }

  if (novoStatus !== "desqualificado") return;

  // 2) WhatsApp educado pela Heloísa — só com a janela de 24h aberta (texto
  //    livre fora da janela é rejeitado pela Meta). Marcado como aviso de
  //    desqualificação → o bot silencia depois disso.
  try {
    if (lead.whatsapp && (await janela24hAberta(lead.id))) {
      const texto = msgNaoSeguiremos(lead.nome, tinhaReuniao);
      const envio = await enviarTextoWhatsApp(lead.whatsapp.replace(/\D/g, ""), texto);
      if (envio.ok) {
        await db.insert(interacoes).values({
          leadId: lead.id,
          autorId: null,
          tipo: "whatsapp_enviado",
          conteudo: texto,
          metadata: {
            canal: "whatsapp_ia",
            automatico: true,
            desqualificado_aviso: true,
            wamid: envio.id ?? null,
          } as never,
        });
      }
    }
  } catch (e) {
    console.error("[encerramento] whatsapp falhou:", e);
  }

  // 3) E-mail educado (layout de cliente) — sempre que houver e-mail, como
  //    garantia de entrega mesmo sem janela de WhatsApp.
  try {
    if (lead.email) {
      await sendNaoSeguiremosEmail({
        to: lead.email,
        primeiroNome: primeiroNome(lead.nome),
        tinhaReuniao,
      });
      await db.insert(interacoes).values({
        leadId: lead.id,
        autorId: null,
        tipo: "evento_sistema",
        conteudo: "E-mail enviado ao cliente: não seguiremos com a operação no momento.",
        metadata: { encerramento: "desqualificado", email: true } as never,
      });
    }
  } catch (e) {
    console.error("[encerramento] email falhou:", e);
  }
}
