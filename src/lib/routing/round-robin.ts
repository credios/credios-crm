import { eq, sql } from "drizzle-orm";

import { roundRobinEstado } from "../../../db/schema";
import { db } from "@/lib/db";

/**
 * Próximo usuário do grupo round-robin, com persistência segura contra race.
 * Usa transação + SELECT FOR UPDATE no row da regra.
 *
 * Em dryRun não escreve nada — calcula apenas e retorna o que SERIA atribuído.
 */
export async function pickNextRoundRobin(
  regraId: string,
  grupo: string[],
  options: { dryRun?: boolean } = {},
): Promise<string> {
  if (grupo.length === 0) {
    throw new Error("round-robin: grupo vazio");
  }

  if (options.dryRun) {
    // Dry-run: lê estado atual sem lock e calcula próximo, mas não persiste.
    const [state] = await db
      .select()
      .from(roundRobinEstado)
      .where(eq(roundRobinEstado.regraId, regraId))
      .limit(1);
    return computeNext(state?.ultimoUsuarioId ?? null, grupo);
  }

  return await db.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(roundRobinEstado)
      .where(eq(roundRobinEstado.regraId, regraId))
      .for("update")
      .limit(1);

    const proximo = computeNext(state?.ultimoUsuarioId ?? null, grupo);

    if (state) {
      await tx
        .update(roundRobinEstado)
        .set({ ultimoUsuarioId: proximo, atualizadoEm: sql`NOW()` })
        .where(eq(roundRobinEstado.id, state.id));
    } else {
      await tx.insert(roundRobinEstado).values({
        regraId,
        ultimoUsuarioId: proximo,
      });
    }

    return proximo;
  });
}

function computeNext(ultimo: string | null, grupo: string[]): string {
  if (grupo.length === 0) throw new Error("grupo vazio");
  if (!ultimo) return grupo[0];
  const idx = grupo.indexOf(ultimo);
  if (idx === -1) return grupo[0];
  return grupo[(idx + 1) % grupo.length];
}

/** Exportado para testes unitários (pure function, sem DB). */
export const __computeNextForTest = computeNext;
