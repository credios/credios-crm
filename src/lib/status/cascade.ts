import "server-only";

import { and, asc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";

import { interacoes, leads, slaAlertas, statusLeadConfig } from "../../../db/schema";
import { db } from "@/lib/db";
import { SYSTEM_TERMINAL_KEYS } from "@/lib/status/canonical";

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

  // Move os leads — e dispara os efeitos que TODA transição de status tem:
  // registro em `interacoes` (o funil dos relatórios é histórico-based; sem
  // isso a transição some das métricas), limpeza do estado de cadência (o
  // cadencia_passo antigo indexaria os passos da cadência do status NOVO) e
  // resolução de alertas de SLA quando o destino é terminal.
  const result = await db
    .update(leads)
    .set({
      status: resolvedTarget,
      cadenciaPasso: null,
      cadenciaProximaEm: null,
      cadenciaInicioEm: null,
    })
    .where(eq(leads.status, removedKey))
    .returning({ id: leads.id });

  if (result.length > 0) {
    await db.insert(interacoes).values(
      result.map((r) => ({
        leadId: r.id,
        autorId: null,
        tipo: "mudanca_status" as const,
        conteudo: `Status alterado de ${removedKey} para ${resolvedTarget} (status desativado pelo admin)`,
        metadata: {
          de: removedKey,
          para: resolvedTarget,
          cascade: true,
        } as never,
      })),
    );
    if (SYSTEM_TERMINAL_KEYS.has(resolvedTarget)) {
      await db
        .update(slaAlertas)
        .set({ resolvidoEm: new Date() })
        .where(
          and(
            inArray(slaAlertas.leadId, result.map((r) => r.id)),
            isNull(slaAlertas.resolvidoEm),
          ),
        );
    }
  }

  return { target: resolvedTarget, movedCount: result.length };
}
