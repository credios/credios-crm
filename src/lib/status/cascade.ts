import "server-only";

import { and, asc, eq, lt, ne, sql } from "drizzle-orm";

import { leads, statusLeadConfig } from "../../../db/schema";
import { db } from "@/lib/db";

/**
 * Quando admin desativa ou exclui o status X, todos os leads em X precisam
 * ir pra algum lugar — caso contrário ficariam num status "fantasma" que
 * sumiu da UI.
 *
 * Estratégia:
 *  1. Se admin passou um `targetKey` explícito, usa esse (deve ser ativo e
 *     diferente do que está sendo removido — caller valida).
 *  2. Caso contrário, escolhe o status ATIVO imediatamente anterior por
 *     `ordem`. Se não existir anterior, pega o primeiro ativo geral.
 *  3. Se mesmo assim não há nenhum ativo (caso degenerado), faz upsert
 *     do `novo` (recriando se preciso) — sistema sempre tem fallback.
 *
 * Retorna `{ target, movedCount }` pro caller logar e responder.
 */
export async function cascadeLeadsFromStatus(
  removedKey: string,
  targetKey?: string | null,
): Promise<{ target: string; movedCount: number }> {
  let resolvedTarget = targetKey ?? null;

  if (!resolvedTarget) {
    // Pega o status ATIVO de menor `ordem` que ainda seja anterior ao
    // removido. `removed` tem que existir pra termos a ordem dele.
    const [removed] = await db
      .select({ ordem: statusLeadConfig.ordem })
      .from(statusLeadConfig)
      .where(eq(statusLeadConfig.key, removedKey))
      .limit(1);

    if (removed) {
      const [previous] = await db
        .select({ key: statusLeadConfig.key })
        .from(statusLeadConfig)
        .where(
          and(
            eq(statusLeadConfig.ativo, true),
            ne(statusLeadConfig.key, removedKey),
            lt(statusLeadConfig.ordem, removed.ordem),
          ),
        )
        .orderBy(sql`${statusLeadConfig.ordem} DESC`)
        .limit(1);
      resolvedTarget = previous?.key ?? null;
    }

    if (!resolvedTarget) {
      // Não há "anterior" — pega o primeiro ativo qualquer.
      const [first] = await db
        .select({ key: statusLeadConfig.key })
        .from(statusLeadConfig)
        .where(
          and(
            eq(statusLeadConfig.ativo, true),
            ne(statusLeadConfig.key, removedKey),
          ),
        )
        .orderBy(asc(statusLeadConfig.ordem))
        .limit(1);
      resolvedTarget = first?.key ?? null;
    }
  }

  if (!resolvedTarget) {
    // Caso degenerado: admin acabou de desativar TODOS. Recria 'novo'
    // pra termos um terminal de sanidade.
    await db
      .insert(statusLeadConfig)
      .values({
        key: "novo",
        label: "Novo",
        ordem: 0,
        ativo: true,
        eTerminal: false,
        eSistema: true,
      })
      .onConflictDoUpdate({
        target: statusLeadConfig.key,
        set: { ativo: true },
      });
    resolvedTarget = "novo";
  }

  // Move os leads.
  const result = await db
    .update(leads)
    .set({ status: resolvedTarget })
    .where(eq(leads.status, removedKey))
    .returning({ id: leads.id });

  return { target: resolvedTarget, movedCount: result.length };
}
