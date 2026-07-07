import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { interacoes, leads as leadsTable, reunioes } from "../../../db/schema";
import { db } from "@/lib/db";

// Métricas de DISCIPLINA de follow-up (janela fixa de 30 dias) — alimentam o
// bloco no /meu-desempenho. O que é medido na frente do time, melhora.

export type DisciplinaFollowup = {
  reunioesMarcadas: number;
  reunioesRealizadas: number;
  reunioesNoShow: number;
  mensagensCadencia: number;
  ligacoesCadencia: number;
  decisoesTomadas: number; // fim de cadência + faxina (perdido/desq/manter)
  autoPerdidos: number; // encerrados pelo coletor (decisão ignorada)
};

export async function disciplinaFollowup(consultorId: string): Promise<DisciplinaFollowup> {
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [reun, acoes, decisoes, auto] = await Promise.all([
    db
      .select({ status: reunioes.status, n: sql<number>`count(*)::int` })
      .from(reunioes)
      .where(and(eq(reunioes.consultorId, consultorId), gte(reunioes.createdAt, desde)))
      .groupBy(reunioes.status),
    db
      .select({ tipo: interacoes.tipo, n: sql<number>`count(*)::int` })
      .from(interacoes)
      .where(
        and(
          eq(interacoes.autorId, consultorId),
          gte(interacoes.criadoEm, desde),
          sql`(${interacoes.metadata} ->> 'cadencia') = 'true'`,
        ),
      )
      .groupBy(interacoes.tipo),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(interacoes)
      .where(
        and(
          eq(interacoes.autorId, consultorId),
          gte(interacoes.criadoEm, desde),
          sql`((${interacoes.metadata} ->> 'faxina') = 'true' or (${interacoes.metadata} ->> 'manter') = 'true' or (${interacoes.tipo} = 'mudanca_status' and (${interacoes.metadata} ->> 'cadencia') = 'true'))`,
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(interacoes)
      .innerJoin(leadsTable, eq(leadsTable.id, interacoes.leadId))
      .where(
        and(
          eq(leadsTable.consultorId, consultorId),
          gte(interacoes.criadoEm, desde),
          sql`(${interacoes.metadata} ->> 'auto_perdido') = 'true'`,
        ),
      ),
  ]);

  const porStatus = new Map(reun.map((r) => [r.status, r.n]));
  const porTipo = new Map(acoes.map((r) => [r.tipo, r.n]));

  return {
    reunioesMarcadas: reun.reduce((s, r) => s + r.n, 0),
    reunioesRealizadas: porStatus.get("realizada") ?? 0,
    reunioesNoShow: porStatus.get("no_show") ?? 0,
    mensagensCadencia: porTipo.get("whatsapp_enviado") ?? 0,
    ligacoesCadencia: porTipo.get("ligacao") ?? 0,
    decisoesTomadas: decisoes[0]?.n ?? 0,
    autoPerdidos: auto[0]?.n ?? 0,
  };
}
