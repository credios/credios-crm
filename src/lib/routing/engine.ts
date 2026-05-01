import { matchesConditions } from "./conditions";
import type {
  AcaoAtribuirUsuario,
  AcaoRoundRobinGrupo,
  RoutingContext,
  RoutingDeps,
  RoutingResult,
  RoutingRule,
} from "./types";

const POOL_RESULT: RoutingResult = {
  consultorId: null,
  regraAplicada: "pool_default",
  regraId: null,
};

/**
 * Avalia regras_roteamento ativas (ordenadas por prioridade desc) e executa a
 * primeira que bater com `ctx`. Retorna pool se nenhuma bate ou se a ação
 * resultante falhar (ex: round-robin com grupo vazio).
 *
 * Engine é stateless e recebe `deps` (DI) — facilita testes sem DB.
 */
export async function aplicarRoteamento(
  ctx: RoutingContext,
  deps: RoutingDeps,
  options?: { dryRun?: boolean },
): Promise<RoutingResult> {
  const rules = await deps.listActiveRules();

  for (const rule of rules) {
    if (!rule.ativa) continue;
    if (!matchesConditions(ctx, rule.condicoes)) continue;

    try {
      const consultorId = await executeAction(rule, deps, options);
      return {
        consultorId,
        regraAplicada: rule.nome,
        regraId: rule.id,
      };
    } catch (err) {
      console.warn(
        `[routing] regra "${rule.nome}" (${rule.id}) bateu mas falhou ao executar — caindo pro pool. Erro:`,
        err,
      );
      return POOL_RESULT;
    }
  }

  return POOL_RESULT;
}

async function executeAction(
  rule: RoutingRule,
  deps: RoutingDeps,
  options?: { dryRun?: boolean },
): Promise<string | null> {
  switch (rule.acao) {
    case "atribuir_usuario": {
      const params = rule.parametros as AcaoAtribuirUsuario | null;
      if (!params || !params.usuario_id || typeof params.usuario_id !== "string") {
        throw new Error("atribuir_usuario sem usuario_id");
      }
      return params.usuario_id;
    }
    case "round_robin_grupo": {
      const params = rule.parametros as AcaoRoundRobinGrupo | null;
      const grupo = Array.isArray(params?.grupo_usuarios)
        ? params!.grupo_usuarios.filter((u) => typeof u === "string")
        : [];
      if (grupo.length === 0) {
        throw new Error("round_robin_grupo sem grupo_usuarios");
      }
      return await deps.pickNextRoundRobin(rule.id, grupo, options);
    }
    case "pool_nao_atribuido":
      return null;
  }
}
