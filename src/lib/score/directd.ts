import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";

import { consultasScore, interacoes, leads as leadsTable } from "../../../db/schema";
import { db } from "@/lib/db";

// Score de crédito por CPF via Direct Data (produto "Score de Crédito - QUOD").
// Cada hit é PAGO — daí as regras: manual só admin (com confirmação na UI),
// automático só ao agendar reunião, e dedup de 30 dias por CPF.

const DEDUP_DIAS = 30;
const API_URL = "https://apiv3.directd.com.br/api/Score";

export type ConsultaScore = {
  id: string;
  score: number | null;
  faixa: string | null;
  criadoEm: Date;
  consultadoPor: string | null;
};

export type ResultadoConsulta =
  | { ok: true; consulta: ConsultaScore; dedup: boolean }
  | { ok: false; erro: string };

/** Última consulta de score do lead (qualquer CPF), pra exibir no card. */
export async function ultimaConsultaScore(
  leadId: string,
): Promise<ConsultaScore | null> {
  const [row] = await db
    .select({
      id: consultasScore.id,
      score: consultasScore.score,
      faixa: consultasScore.faixa,
      criadoEm: consultasScore.criadoEm,
      consultadoPor: consultasScore.consultadoPor,
    })
    .from(consultasScore)
    .where(eq(consultasScore.leadId, leadId))
    .orderBy(desc(consultasScore.criadoEm))
    .limit(1);
  return row ?? null;
}

/**
 * Consulta o score do lead na Direct Data e grava vinculado ao histórico.
 *
 * - `autorId` null = consulta automática (agendamento de reunião).
 * - `forcar` pula o dedup (botão manual do admin, após confirmação na UI).
 * - Dedup: mesmo CPF consultado há < 30 dias → devolve a consulta existente
 *   sem gastar um hit novo.
 */
export async function consultarScoreLead(
  leadId: string,
  opts: { autorId: string | null; forcar?: boolean },
): Promise<ResultadoConsulta> {
  const token = process.env.DIRECTD_TOKEN;
  if (!token) return { ok: false, erro: "DIRECTD_TOKEN não configurado" };

  const [lead] = await db
    .select({ id: leadsTable.id, cpf: leadsTable.cpf, nome: leadsTable.nome })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);
  if (!lead) return { ok: false, erro: "lead não encontrado" };

  const cpf = (lead.cpf ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) return { ok: false, erro: "lead sem CPF válido" };

  if (!opts.forcar) {
    const corte = new Date(Date.now() - DEDUP_DIAS * 24 * 60 * 60 * 1000);
    const [recente] = await db
      .select({
        id: consultasScore.id,
        score: consultasScore.score,
        faixa: consultasScore.faixa,
        criadoEm: consultasScore.criadoEm,
        consultadoPor: consultasScore.consultadoPor,
      })
      .from(consultasScore)
      .where(and(eq(consultasScore.cpf, cpf), gte(consultasScore.criadoEm, corte)))
      .orderBy(desc(consultasScore.criadoEm))
      .limit(1);
    if (recente) return { ok: true, consulta: recente, dedup: true };
  }

  let payload: DirectDataScoreResponse;
  try {
    const res = await fetch(
      `${API_URL}?CPF=${cpf}&TOKEN=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(15_000), cache: "no-store" },
    );
    payload = (await res.json()) as DirectDataScoreResponse;
    if (!res.ok || payload?.metaDados?.resultadoId !== 1) {
      const msg = payload?.metaDados?.mensagem ?? `HTTP ${res.status}`;
      return { ok: false, erro: `Direct Data: ${msg}` };
    }
  } catch (e) {
    return {
      ok: false,
      erro: `Direct Data indisponível: ${e instanceof Error ? e.message : "erro"}`,
    };
  }

  const score = payload.retorno?.pessoaFisica?.score ?? null;
  const faixa = payload.retorno?.pessoaFisica?.faixaScore ?? null;

  const [consulta] = await db
    .insert(consultasScore)
    .values({
      leadId: lead.id,
      cpf,
      score,
      faixa,
      rawPayload: payload as never,
      consultadoPor: opts.autorId,
    })
    .returning({
      id: consultasScore.id,
      score: consultasScore.score,
      faixa: consultasScore.faixa,
      criadoEm: consultasScore.criadoEm,
      consultadoPor: consultasScore.consultadoPor,
    });

  await db.insert(interacoes).values({
    leadId: lead.id,
    autorId: opts.autorId,
    tipo: "evento_sistema",
    conteudo: `Score de crédito consultado (QUOD): ${score ?? "—"}${faixa ? ` · ${faixa}` : ""}`,
    metadata: {
      kind: "score_consultado",
      consultaScoreId: consulta!.id,
      score,
      faixa,
      automatico: opts.autorId === null,
    } as never,
  });

  return { ok: true, consulta: consulta!, dedup: false };
}

type DirectDataScoreResponse = {
  metaDados?: { resultadoId?: number; mensagem?: string };
  retorno?: {
    pessoaFisica?: { score?: number | null; faixaScore?: string | null } | null;
  } | null;
};
