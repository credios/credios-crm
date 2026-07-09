import "server-only";

import { interacoes } from "../../../db/schema";
import { db } from "@/lib/db";
import {
  FUNIL_MIN_CREDITO_CENTAVOS,
  FUNIL_MIN_IMOVEL_CENTAVOS,
  SCORE_MINIMO_REUNIAO,
} from "@/lib/politica-credito";
import { consultarScoreLead, ultimaConsultaScore } from "@/lib/score/directd";

// GATE DE SCORE pra oferta de reunião (regra do owner, 2026-07-07; critérios
// unificados com o nível FUNIL da política central em 09/07/2026):
//   - Consulta automática no fim do formulário pra quem tem CPF e está no
//     funil (imóvel ≥ 300k, crédito ≥ 75k — antes o corte era 100k). Dedup
//     de 30 dias já protege o custo.
//   - Score < 650 → NÃO oferecer reunião (nem grade na tela de sucesso, nem
//     oferta da Heloísa). O lead segue o fluxo normal: Heloísa atende e
//     qualifica; marketing/comercial analisam manualmente (score no CRM).
//   - Sem score (sem CPF, critérios não batem, API falhou) → FAIL-OPEN: a
//     pré-qualificação determinística decide sozinha, como antes.

// Re-export pra compatibilidade (webhook e Heloísa importam daqui).
export { SCORE_MINIMO_REUNIAO };

export function dentroCriteriosConsultaScore(lead: {
  cpf: string | null;
  valorImovelCentavos: number | null;
  valorCreditoCentavos: number | null;
}): boolean {
  return (
    (lead.cpf ?? "").replace(/\D/g, "").length === 11 &&
    (lead.valorImovelCentavos ?? 0) >= FUNIL_MIN_IMOVEL_CENTAVOS &&
    (lead.valorCreditoCentavos ?? 0) >= FUNIL_MIN_CREDITO_CENTAVOS
  );
}

/** Consulta (com dedup 30d) e devolve o score, ou null (falha/sem dados). */
export async function consultarScoreParaGate(leadId: string): Promise<number | null> {
  try {
    const r = await consultarScoreLead(leadId, { autorId: null });
    return r.ok ? r.consulta.score : null;
  } catch (e) {
    console.error("[score-gate] consulta falhou:", e);
    return null;
  }
}

/** true = já existe score consultado e ele está ABAIXO do corte de reunião. */
export async function scoreBloqueiaReuniao(leadId: string): Promise<boolean> {
  try {
    const c = await ultimaConsultaScore(leadId);
    return c?.score != null && c.score < SCORE_MINIMO_REUNIAO;
  } catch {
    return false; // fail-open
  }
}

/** Registra na timeline que a oferta de reunião foi suprimida pelo score. */
export async function registrarSupressaoPorScore(
  leadId: string,
  score: number,
  onde: "agenda_publica" | "heloisa",
): Promise<void> {
  await db.insert(interacoes).values({
    leadId,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: `Oferta de reunião suprimida — score ${score} abaixo do corte (${SCORE_MINIMO_REUNIAO}). Lead segue pra análise manual.`,
    metadata: { kind: "score_gate", score, corte: SCORE_MINIMO_REUNIAO, onde } as never,
  });
}
