import {
  FUNIL_MIN_CREDITO_CENTAVOS,
  FUNIL_MIN_IMOVEL_CENTAVOS,
  FUNIL_MIN_RENDA_COM_CONJUGE_CENTAVOS,
  FUNIL_MIN_RENDA_TITULAR_CENTAVOS,
  rendaQualificaCentavos,
  saldoForaDaPolitica,
} from "@/lib/politica-credito";

// Pré-qualificação de CGI na indicação do parceiro. Os pisos vêm da política
// central (src/lib/politica-credito.ts); a tabela de LTV por tipo de imóvel é
// a do simulador do site (espelho de qualificacao.ts em credios-website-v2 —
// mudou lá, mude aqui): parceiro e simulador têm que aceitar pelo mesmo critério.

export const TIPOS_IMOVEL_PARCEIRO: { label: string; ltv: number; foraDaPolitica?: boolean }[] = [
  { label: "Apartamento", ltv: 0.6 },
  { label: "Casa de condomínio", ltv: 0.6 },
  { label: "Casa de rua", ltv: 0.5 },
  { label: "Sala comercial", ltv: 0.5 },
  { label: "Loja", ltv: 0.5 },
  { label: "Galpão", ltv: 0.5 },
  { label: "Terreno", ltv: 0.4 },
  { label: "Imóvel rural", ltv: 0, foraDaPolitica: true },
  { label: "Outro", ltv: 0.4 },
];

export const MAX_IMOVEL_CENTAVOS = 2_000_000_000; // R$ 20 milhões

function brl(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export type CgiPrequalInput = {
  tipoImovel: string;
  valorImovelCentavos: number;
  valorCreditoCentavos: number;
  rendaTitularCentavos: number;
  rendaConjugeCentavos: number;
  saldoDevedorCentavos: number;
};

/** Erros por campo ({} = passou). Devolve TODOS de uma vez, não um por envio. */
export function prequalCgi(d: CgiPrequalInput): Record<string, string> {
  const erros: Record<string, string> = {};
  const tipo = TIPOS_IMOVEL_PARCEIRO.find((t) => t.label === d.tipoImovel);
  if (!tipo) {
    erros.tipoImovel = "Selecione o tipo do imóvel.";
    return erros;
  }
  if (tipo.foraDaPolitica) {
    erros.tipoImovel =
      "Imóvel rural está fora da política de crédito — não é possível indicar esta operação.";
    return erros;
  }

  if (d.valorImovelCentavos < FUNIL_MIN_IMOVEL_CENTAVOS) {
    erros.valorImovel = `O imóvel precisa valer no mínimo ${brl(FUNIL_MIN_IMOVEL_CENTAVOS)}.`;
  } else if (d.valorImovelCentavos > MAX_IMOVEL_CENTAVOS) {
    erros.valorImovel = `Imóvel acima de ${brl(MAX_IMOVEL_CENTAVOS)} exige análise caso a caso — fale com a Credios.`;
  }

  const teto = Math.floor(d.valorImovelCentavos * tipo.ltv);
  if (d.valorCreditoCentavos < FUNIL_MIN_CREDITO_CENTAVOS) {
    erros.valorCredito = `O crédito mínimo é de ${brl(FUNIL_MIN_CREDITO_CENTAVOS)}.`;
  } else if (d.valorCreditoCentavos > teto) {
    erros.valorCredito = `Para ${tipo.label.toLowerCase()}, o crédito vai até ${Math.round(tipo.ltv * 100)}% do imóvel — no máximo ${brl(teto)}.`;
  }

  if (!rendaQualificaCentavos(d.rendaTitularCentavos, d.rendaConjugeCentavos)) {
    erros.rendaTitular = `Renda abaixo do mínimo: ${brl(FUNIL_MIN_RENDA_TITULAR_CENTAVOS)} do titular, ou ${brl(FUNIL_MIN_RENDA_COM_CONJUGE_CENTAVOS)} somando com o cônjuge.`;
  }

  if (d.saldoDevedorCentavos > 0) {
    if (saldoForaDaPolitica(d.saldoDevedorCentavos, d.valorImovelCentavos)) {
      erros.saldoDevedor =
        "Saldo devedor igual ou acima de 50% do valor do imóvel — fora da política.";
    } else if (teto - d.saldoDevedorCentavos < FUNIL_MIN_CREDITO_CENTAVOS) {
      erros.saldoDevedor = `Após quitar o financiamento sobrariam só ${brl(Math.max(0, teto - d.saldoDevedorCentavos))} líquidos, abaixo do mínimo de ${brl(FUNIL_MIN_CREDITO_CENTAVOS)}.`;
    }
  }
  return erros;
}
