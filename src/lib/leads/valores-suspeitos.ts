/**
 * Detector de valores monetários fora do range esperado.
 *
 * Heurística: tipos de valores que ~99% das vezes são erro de digitação
 * (cliente confundiu casas decimais — quis dizer "30 mil" e digitou
 * "30.000.000" = 30 milhões). Em vez de rejeitar o lead (perderia
 * contato), aceitamos e marcamos pra revisão manual no CRM.
 *
 * Thresholds calibrados pra perfil Credios (CGI brasileiro):
 *   - Renda mensal: até R$ 1M (acima é raríssimo no público CGI).
 *   - Imóvel: até R$ 30M (acima é high-net-worth, fora do alvo).
 *   - Crédito buscado: até R$ 10M (política CGI típica vai até ~R$ 3M).
 *
 * UI no CRM (`/leads/[id]`) mostra banner com 2 botões:
 *   - "Aplicar correção sugerida" → divide os estourados por 1000
 *   - "Confirmar valores corretos" → mantém originais
 */

/** Valores em REAIS (não centavos). Cliente envia em reais; convertemos
 *  pra centavos só no momento de salvar no banco. */
export const THRESHOLD_RENDA_REAIS = 1_000_000; // R$ 1M/mês
export const THRESHOLD_IMOVEL_REAIS = 30_000_000; // R$ 30M
export const THRESHOLD_CREDITO_REAIS = 10_000_000; // R$ 10M

export type ValoresInput = {
  /** Em reais (não centavos). */
  rendaMensal?: number | null;
  /** Em reais. */
  valorImovel?: number | null;
  /** Em reais. */
  valorCredito?: number | null;
};

export type CamposSuspeitos = {
  renda?: boolean;
  imovel?: boolean;
  credito?: boolean;
};

export type ValoresSuspeitos = {
  /** Quais campos estouraram o threshold. */
  campos: CamposSuspeitos;
  /** Valores em REAIS originais (preserva pra audit/fallback). */
  valoresOriginais: {
    renda?: number;
    imovel?: number;
    credito?: number;
  };
  /** Limites usados na detecção — útil pra UI explicar o motivo. */
  thresholds: {
    renda: number;
    imovel: number;
    credito: number;
  };
};

/**
 * Detecta valores suspeitos baseado nos thresholds. Retorna null se
 * nenhum estourou (lead com valores razoáveis).
 */
export function detectarValoresSuspeitos(
  input: ValoresInput,
): ValoresSuspeitos | null {
  const campos: CamposSuspeitos = {};
  const valoresOriginais: ValoresSuspeitos["valoresOriginais"] = {};

  if (
    typeof input.rendaMensal === "number" &&
    input.rendaMensal > THRESHOLD_RENDA_REAIS
  ) {
    campos.renda = true;
    valoresOriginais.renda = input.rendaMensal;
  }
  if (
    typeof input.valorImovel === "number" &&
    input.valorImovel > THRESHOLD_IMOVEL_REAIS
  ) {
    campos.imovel = true;
    valoresOriginais.imovel = input.valorImovel;
  }
  if (
    typeof input.valorCredito === "number" &&
    input.valorCredito > THRESHOLD_CREDITO_REAIS
  ) {
    campos.credito = true;
    valoresOriginais.credito = input.valorCredito;
  }

  if (Object.keys(campos).length === 0) return null;

  return {
    campos,
    valoresOriginais,
    thresholds: {
      renda: THRESHOLD_RENDA_REAIS,
      imovel: THRESHOLD_IMOVEL_REAIS,
      credito: THRESHOLD_CREDITO_REAIS,
    },
  };
}

/**
 * Calcula valores corrigidos (÷1000) apenas pros campos suspeitos.
 * Campos não suspeitos são preservados intactos. Saída em REAIS.
 *
 * Ex.: input { renda: 6_000_000, imovel: 110_000_000, credito: 30_000 }
 *      suspeitos: { renda: true, imovel: true } (credito NÃO marcou)
 *      → output { renda: 6_000, imovel: 110_000, credito: 30_000 }
 */
export function calcularValoresCorrigidos(
  input: ValoresInput,
  suspeitos: ValoresSuspeitos,
): {
  rendaMensal: number | null;
  valorImovel: number | null;
  valorCredito: number | null;
} {
  return {
    rendaMensal:
      suspeitos.campos.renda && typeof input.rendaMensal === "number"
        ? Math.round(input.rendaMensal / 1000)
        : (input.rendaMensal ?? null),
    valorImovel:
      suspeitos.campos.imovel && typeof input.valorImovel === "number"
        ? Math.round(input.valorImovel / 1000)
        : (input.valorImovel ?? null),
    valorCredito:
      suspeitos.campos.credito && typeof input.valorCredito === "number"
        ? Math.round(input.valorCredito / 1000)
        : (input.valorCredito ?? null),
  };
}

/** Helper pra UI: lista campos com seus valores originais. */
export function listarCamposSuspeitos(
  suspeitos: ValoresSuspeitos,
): Array<{ campo: "renda" | "imovel" | "credito"; valor: number }> {
  const out: Array<{ campo: "renda" | "imovel" | "credito"; valor: number }> =
    [];
  if (suspeitos.campos.renda && suspeitos.valoresOriginais.renda != null) {
    out.push({ campo: "renda", valor: suspeitos.valoresOriginais.renda });
  }
  if (suspeitos.campos.imovel && suspeitos.valoresOriginais.imovel != null) {
    out.push({ campo: "imovel", valor: suspeitos.valoresOriginais.imovel });
  }
  if (suspeitos.campos.credito && suspeitos.valoresOriginais.credito != null) {
    out.push({ campo: "credito", valor: suspeitos.valoresOriginais.credito });
  }
  return out;
}

export const CAMPO_LABEL: Record<"renda" | "imovel" | "credito", string> = {
  renda: "Renda mensal",
  imovel: "Valor do imóvel",
  credito: "Crédito buscado",
};
