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
 * resultante falhar (ex: round-robin com grupo vazio, usuário inativo).
 *
 * Engine é stateless e recebe `deps` (DI) — facilita testes sem DB.
 *
 * Validação de elegibilidade:
 *   - `atribuir_usuario` cujo usuario_id NÃO está em `assignableIds` → cai pro pool.
 *   - `round_robin_grupo` filtra grupo pra só usuários elegíveis ANTES de
 *     chamar pickNextRoundRobin. Se filtragem deixa grupo vazio → pool.
 */
export async function aplicarRoteamento(
  ctx: RoutingContext,
  deps: RoutingDeps,
  options?: { dryRun?: boolean },
): Promise<RoutingResult> {
  const [rules, assignableArr] = await Promise.all([
    deps.listActiveRules(),
    deps.listAssignableUserIds(),
  ]);
  const assignable = new Set(assignableArr);

  for (const rule of rules) {
    if (!rule.ativa) continue;
    if (!matchesConditions(ctx, rule.condicoes)) continue;

    try {
      const consultorId = await executeAction(rule, deps, assignable, options);
      // Se a ação retornou null (pool_nao_atribuido) ou não conseguiu user
      // elegível, retorna pool com a regra que bateu (audit fica claro).
      if (consultorId === null && rule.acao !== "pool_nao_atribuido") {
        return {
          consultorId: null,
          regraAplicada: `${rule.nome} → pool (nenhum usuário elegível)`,
          regraId: rule.id,
        };
      }
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
  assignable: Set<string>,
  options?: { dryRun?: boolean },
): Promise<string | null> {
  switch (rule.acao) {
    case "atribuir_usuario": {
      const params = rule.parametros as AcaoAtribuirUsuario | null;
      if (!params || !params.usuario_id || typeof params.usuario_id !== "string") {
        throw new Error("atribuir_usuario sem usuario_id");
      }
      // Validação: user precisa ser elegível (ativo + perfil válido).
      if (!assignable.has(params.usuario_id)) {
        console.warn(
          `[routing] regra "${rule.nome}" aponta pra usuário não-elegível (${params.usuario_id}). Caindo pro pool.`,
        );
        return null;
      }
      return params.usuario_id;
    }
    case "round_robin_grupo": {
      const params = rule.parametros as AcaoRoundRobinGrupo | null;
      const grupoBruto = Array.isArray(params?.grupo_usuarios)
        ? params!.grupo_usuarios.filter((u) => typeof u === "string")
        : [];
      // Filtra pra só usuários elegíveis. Mantém ordem original (round-robin
      // fica determinístico).
      const grupo = grupoBruto.filter((id) => assignable.has(id));
      if (grupo.length === 0) {
        if (grupoBruto.length > 0) {
          console.warn(
            `[routing] regra "${rule.nome}" tinha ${grupoBruto.length} usuários no grupo, mas nenhum é elegível. Caindo pro pool.`,
          );
          return null;
        }
        throw new Error("round_robin_grupo sem grupo_usuarios");
      }
      return await deps.pickNextRoundRobin(rule.id, grupo, options);
    }
    case "pool_nao_atribuido":
      return null;
  }
}
