"use server";

import {
  simpleSimulatorSchema,
  type SimpleSimulatorFormValues,
} from "./validator";
import {
  buildSimulationResult,
  type CreateSimpleSimulationResponse,
} from "./simple-simulator";
import { generateSimulationId } from "./simulation-id";

// Re-export pros consumidores (mesmo padrão do simulador atual no site).
export type {
  SimpleSimulationResult,
  SimpleAmortizationRow,
  CreateSimpleSimulationResponse,
  AmortizationType,
  Indexation,
} from "./simple-simulator";

/**
 * Server action que valida + gera a simulação completa.
 * Sem persistência — o resultado é calculado on-the-fly e devolvido pra
 * UI renderizar o PDF. Auditoria leve fica numa interação tipo
 * `evento_sistema` registrada separadamente quando o consultor
 * gera (via API).
 */
export async function createSimpleSimulation(
  data: SimpleSimulatorFormValues,
): Promise<CreateSimpleSimulationResponse> {
  const parsed = simpleSimulatorSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        "Dados inválidos. Verifique os campos.",
    };
  }

  try {
    const result = buildSimulationResult(parsed.data, {
      simulationId: generateSimulationId(),
    });
    return { success: true, data: result };
  } catch (err) {
    console.error("[simulador] erro ao calcular:", err);
    return { success: false, error: "Erro ao calcular a simulação." };
  }
}
