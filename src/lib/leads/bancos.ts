import "server-only";

import { asc, eq } from "drizzle-orm";

import { interacoes, leadBancos } from "../../../db/schema";
import { db } from "@/lib/db";

/**
 * Funções utilitárias relacionadas ao gating de bancos por lead.
 * Migradas do antigo src/lib/tasks/service.ts (que foi descontinuado
 * junto com o módulo de tarefas — ver CLAUDE.md / git log).
 */

export async function listLeadBancos(leadId: string) {
  return await db
    .select()
    .from(leadBancos)
    .where(eq(leadBancos.leadId, leadId))
    .orderBy(asc(leadBancos.banco));
}

export async function ensureBancoInteracao(params: {
  leadId: string;
  userId: string;
  banco: string;
  status: string;
  observacoes?: string | null;
}) {
  await db.insert(interacoes).values({
    leadId: params.leadId,
    autorId: params.userId,
    tipo: "evento_sistema",
    conteudo: `Banco/proposta atualizado: ${params.banco} (${params.status})`,
    metadata: {
      banco: params.banco,
      status: params.status,
      observacoes: params.observacoes ?? null,
    } as never,
  });
}

/** Statuses em que o lead tem propostas em bancos sendo trabalhadas. */
export function isLeadBankStage(status: string): boolean {
  return status === "documentacao_enviada" || status === "em_negociacao";
}

export async function hasLeadBanks(leadId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: leadBancos.id })
    .from(leadBancos)
    .where(eq(leadBancos.leadId, leadId))
    .limit(1);
  return Boolean(row);
}
