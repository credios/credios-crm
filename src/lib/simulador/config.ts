import "server-only";

import { unstable_cache } from "next/cache";

import { simulacaoCondominioConfig, simulacaoConfig } from "../../../db/schema";
import { db } from "@/lib/db";
import {
  saneSimulacaoCondominioConfig,
  type SimulacaoCondominioConfig,
} from "./condominio-config";
import {
  saneSimulacaoConfig,
  type SimulacaoFaixaConfig,
} from "./faixa-config";

// Acesso server-side à config da proposta em faixa (linha única em
// `simulacao_config`, editável pelo Admin). Tipos/defaults puros vivem em
// ./faixa-config (importável em testes e client components).

export const SIMULACAO_CONFIG_CACHE_TAG = "simulacao:config";

async function fetchConfig(): Promise<SimulacaoFaixaConfig> {
  const [row] = await db.select().from(simulacaoConfig).limit(1);
  return saneSimulacaoConfig(row?.config);
}

/** Config vigente (cache 5 min, invalidado no PUT do admin). Fallback pra
 *  fetch direto quando fora do runtime Next (scripts/testes). */
export async function getSimulacaoConfig(): Promise<SimulacaoFaixaConfig> {
  try {
    return await unstable_cache(fetchConfig, ["simulacao:config"], {
      revalidate: 300,
      tags: [SIMULACAO_CONFIG_CACHE_TAG],
    })();
  } catch {
    return fetchConfig();
  }
}

// ── Simulação de crédito para condomínio (portal do parceiro) ──

export const SIMULACAO_CONDOMINIO_CACHE_TAG = "simulacao:condominio";

async function fetchCondominioConfig(): Promise<SimulacaoCondominioConfig> {
  const [row] = await db
    .select({ config: simulacaoCondominioConfig.config })
    .from(simulacaoCondominioConfig)
    .limit(1);
  return saneSimulacaoCondominioConfig(row?.config);
}

/** Taxa por prazo e parâmetros vigentes (cache 5 min, invalidado no PUT). */
export async function getSimulacaoCondominioConfig(): Promise<SimulacaoCondominioConfig> {
  try {
    return await unstable_cache(fetchCondominioConfig, ["simulacao:condominio"], {
      revalidate: 300,
      tags: [SIMULACAO_CONDOMINIO_CACHE_TAG],
    })();
  } catch {
    return fetchCondominioConfig();
  }
}
