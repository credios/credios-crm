import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { interacoes, leads } from "../../../db/schema";
import { db } from "@/lib/db";
import {
  conversarComHeloisa,
  type HeloisaTurn,
  type Mensagem,
} from "@/lib/kommo/heloisa";
import { isSystemTerminal } from "@/lib/status/canonical";

const SIMULADOR_URL = "https://credios.com.br/simulador";

/**
 * Acha o lead pelo telefone (últimos 8 dígitos). Com vários leads no mesmo
 * número, prefere o ativo (não-terminal) mais recente; senão o mais recente.
 */
async function acharLead(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const last8 = digits.slice(-8);
  if (last8.length < 8) return null;
  const rows = await db
    .select()
    .from(leads)
    .where(sql`regexp_replace(${leads.whatsapp}, '\\D', '', 'g') LIKE ${"%" + last8}`)
    .orderBy(desc(leads.createdAt));
  if (rows.length === 0) return null;
  return rows.find((l) => !isSystemTerminal(l.status)) ?? rows[0];
}

type Lead = NonNullable<Awaited<ReturnType<typeof acharLead>>>;

function primeiroNome(lead: Lead): string {
  return lead.nome ? lead.nome.split(/\s+/)[0] : "";
}

/** Lead não encontrado → convida a simular e deixa claro que não localizou. */
function msgNaoIdentificado(): string {
  return [
    "Oi! Sou a Heloísa, da Credios 👋",
    "Não localizei um cadastro seu por aqui. Pra começar, é só fazer a sua simulação (rápida e gratuita):",
    SIMULADOR_URL,
    "Assim que você preencher, um consultor já entra em contato 🙂",
  ].join("\n\n");
}

/** Lead desqualificado → recusa educada. */
function msgDesqualificado(lead: Lead): string {
  const nome = primeiroNome(lead);
  return [
    `Oi${nome ? `, ${nome}` : ""}! Sou a Heloísa, da Credios 👋`,
    "Obrigada pelo seu contato e interesse no crédito com garantia de imóvel.",
    "Neste momento, não conseguimos seguir com a sua solicitação. Se algo mudar, a gente te avisa. Um abraço!",
  ].join("\n\n");
}

/** Fallback do lead ativo quando a Heloísa (IA) não responde. */
function msgFallbackAtivo(lead: Lead): string {
  const nome = primeiroNome(lead);
  return [
    `Oi${nome ? `, ${nome}` : ""}! Aqui é a Heloísa, da Credios 🙂`,
    "Sua proposta de crédito com garantia de imóvel já está em análise. Um consultor entra em contato com você em breve.",
  ].join("\n\n");
}

/** Reconstrói o histórico da conversa (últimas 30 trocas) pra contexto da IA. */
async function carregarHistorico(leadId: string): Promise<Mensagem[]> {
  const rows = await db
    .select({ tipo: interacoes.tipo, conteudo: interacoes.conteudo })
    .from(interacoes)
    .where(
      and(
        eq(interacoes.leadId, leadId),
        inArray(interacoes.tipo, ["whatsapp_recebido", "whatsapp_enviado"]),
      ),
    )
    .orderBy(desc(interacoes.criadoEm))
    .limit(30);
  return rows.reverse().map((r) => ({
    role: r.tipo === "whatsapp_recebido" ? ("user" as const) : ("assistant" as const),
    content: r.conteudo ?? "",
  }));
}

/** Grava os campos de qualificação que a Heloísa descobriu + o status. */
async function persistirQualificacao(leadId: string, turn: HeloisaTurn): Promise<void> {
  const q = turn.qualificacao;
  const set: Partial<typeof leads.$inferInsert> = {};
  if (q.objetivo) set.qualifObjetivo = q.objetivo;
  if (q.titularidade) set.qualifTitularidade = q.titularidade;
  if (q.imovel_regularizado) set.qualifImovelRegularizado = q.imovel_regularizado;
  if (q.pendencia_juridica) set.qualifPendenciaJuridica = q.pendencia_juridica;
  if (q.urgencia) set.qualifUrgencia = q.urgencia;
  set.qualifWhatsappStatus = turn.encerrar ? "concluida" : "em_andamento";
  if (turn.encerrar) set.qualifWhatsappEm = new Date();
  await db.update(leads).set(set).where(eq(leads.id, leadId));
}

/**
 * Decide a resposta pra uma mensagem do cliente e registra na timeline do lead.
 * Canal-agnóstico: hoje usado pelo webhook do WhatsApp (Meta Cloud API). Roteia:
 * não-identificado → simulador; desqualificado → recusa; ativo → Heloísa (IA).
 * Retorna o texto pronto pra enviar (sem corte de 80 — WhatsApp não tem isso).
 */
export async function responderMensagem(phone: string, mensagem: string): Promise<string> {
  const lead = await acharLead(phone);
  console.log(
    "[whatsapp] lead:",
    lead ? `${lead.id} (${lead.nome}) status=${lead.status}` : "(não encontrado)",
  );

  let resposta: string;
  if (!lead) {
    resposta = msgNaoIdentificado();
  } else if (lead.status === "desqualificado") {
    resposta = msgDesqualificado(lead);
  } else if (!mensagem.trim()) {
    // Áudio/imagem/sticker chegam sem texto.
    resposta = "Pode me mandar por texto? Assim consigo te ajudar certinho 🙂";
  } else {
    try {
      const historico = await carregarHistorico(lead.id);
      const turn = await conversarComHeloisa(lead, historico, mensagem);
      resposta = turn.resposta;
      await persistirQualificacao(lead.id, turn);
      console.log(
        "[whatsapp] heloisa:",
        turn.encerrar ? "ENCERROU" : "em andamento",
        "| qualif:",
        JSON.stringify(turn.qualificacao),
      );
    } catch (e) {
      console.error("[whatsapp] heloisa falhou — fallback:", e);
      resposta = msgFallbackAtivo(lead);
    }
  }

  // Timeline do lead (entrada + saída).
  if (lead) {
    if (mensagem.trim()) {
      await db.insert(interacoes).values({
        leadId: lead.id,
        autorId: null,
        tipo: "whatsapp_recebido",
        conteudo: mensagem,
        metadata: { canal: "whatsapp_ia" } as never,
      });
    }
    await db.insert(interacoes).values({
      leadId: lead.id,
      autorId: null,
      tipo: "whatsapp_enviado",
      conteudo: resposta,
      metadata: { canal: "whatsapp_ia", automatico: true } as never,
    });
  }

  return resposta;
}
