import { eq, sql } from "drizzle-orm";

import { roundRobinEstado } from "../../../db/schema";
import { db } from "@/lib/db";

/**
 * Próximo usuário do grupo round-robin, com persistência segura contra race.
 *
 * Algoritmo (atomic, race-safe):
 *   1. UPSERT vazio: INSERT ... ON CONFLICT (regra_id) DO NOTHING. Garante
 *      que existe linha para esta regra (sem race entre 2 workers tentando
 *      criar a primeira linha simultaneamente).
 *   2. Em transação:
 *      a) SELECT ... FOR UPDATE pega lock pessimista da row.
 *      b) Calcula próximo a partir de ultimo_usuario_id REAL (não EXCLUDED).
 *      c) UPDATE.
 *
 * Requer constraint UNIQUE em round_robin_estado(regra_id) — aplicada via
 * db/policies.sql (CREATE UNIQUE INDEX IF NOT EXISTS).
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

  // 1. Garante que existe linha. ON CONFLICT (regra_id) DO NOTHING significa
  // que se outra request chegar na mesma janela, ela vê a linha existente
  // e segue. Sem chance de criar 2 linhas.
  await db
    .insert(roundRobinEstado)
    .values({ regraId, ultimoUsuarioId: null })
    .onConflictDoNothing({ target: roundRobinEstado.regraId });

  // 2. Transação com lock pessimista — SELECT FOR UPDATE bloqueia outras
  // transações na mesma row até o COMMIT, garantindo que o cálculo do
  // próximo usa o ultimo_usuario_id atualizado.
  return await db.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(roundRobinEstado)
      .where(eq(roundRobinEstado.regraId, regraId))
      .for("update")
      .limit(1);

    // state SEMPRE existe aqui — garantido pelo UPSERT acima.
    if (!state) {
      throw new Error(
        "round-robin: estado não encontrado após upsert (não deveria acontecer)",
      );
    }

    const proximo = computeNext(state.ultimoUsuarioId ?? null, grupo);

    await tx
      .update(roundRobinEstado)
      .set({ ultimoUsuarioId: proximo, atualizadoEm: sql`NOW()` })
      .where(eq(roundRobinEstado.id, state.id));

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
