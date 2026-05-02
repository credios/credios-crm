import { and, desc, eq, inArray } from "drizzle-orm";

import { regrasRoteamento, users } from "../../../db/schema";
import { db } from "@/lib/db";

import { pickNextRoundRobin } from "./round-robin";
import type { RoutingDeps, RoutingRule } from "./types";

/**
 * Implementação real das dependências do engine — bate no Postgres via
 * Drizzle. Use `aplicarRoteamento(ctx, realRoutingDeps)` em produção.
 */
export const realRoutingDeps: RoutingDeps = {
  listActiveRules: async (): Promise<RoutingRule[]> => {
    const rows = await db
      .select()
      .from(regrasRoteamento)
      .where(eq(regrasRoteamento.ativa, true))
      .orderBy(desc(regrasRoteamento.prioridade));

    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      ativa: r.ativa,
      prioridade: r.prioridade,
      condicoes: (r.condicoes ?? {}) as RoutingRule["condicoes"],
      acao: r.acao,
      parametros: (r.parametros ?? null) as RoutingRule["parametros"],
    }));
  },
  pickNextRoundRobin,
  listAssignableUserIds: async (): Promise<string[]> => {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.ativo, true),
          inArray(users.perfil, ["admin", "gerente", "consultor"]),
        ),
      );
    return rows.map((r) => r.id);
  },
};
