// Motor de qualificação do SDR (Heloísa). Decide se um lead pode AGENDAR uma
// reunião automaticamente, com base na política da Credios. Lógica pura e
// determinística — a IA junta os fatos (cadastro + conversa) e chama isto.
//
// Resultado:
//  - qualificado: passou em TODOS os critérios → pode rotear + agendar.
//  - reprovados:  critério(s) que FALHARAM → vai pra fila MANUAL (não agenda).
//  - faltando:    dado(s) ainda não confirmados → a IA precisa perguntar antes.
//
// "Não qualificado" NUNCA é "desqualificado" — é só "não agenda automaticamente".
// Limiares vêm da política central (src/lib/politica-credito.ts).

import {
  LTV_MAX,
  REUNIAO_MIN_CREDITO_CENTAVOS,
  SALDO_MAX_RATIO,
  saldoForaDaPolitica,
} from "@/lib/politica-credito";

const TIPO_IMOVEL_MANUAL = "Outros"; // tipo "Outros" → revisão manual

export type FatosQualificacao = {
  // do cadastro
  valorCreditoCentavos: number | null;
  valorImovelCentavos: number | null;
  saldoDevedorCentavos: number | null;
  situacaoImovel: string | null; // "Quitado" | "Financiado" | ...
  tipoImovel: string | null; // "Casa" | "Apartamento" | "Outros" | ...
  // da conversa (a IA preenche)
  temImovelGarantia: boolean | null; // cliente tem imóvel pra dar em garantia?
  imovelRegularizado: "sim" | "nao" | "nao_sei" | null;
  pendenciaBloqueante: boolean | null; // inventário/penhora/disputa/bloqueio?
};

export type ResultadoQualificacao = {
  qualificado: boolean;
  reprovados: string[]; // critérios que falharam (→ manual)
  faltando: string[]; // dados a confirmar (→ IA pergunta)
};

function ehFinanciado(situacao: string | null, saldo: number | null): boolean {
  if (situacao && /financ/i.test(situacao)) return true;
  return (saldo ?? 0) > 0;
}

export function avaliarQualificacao(f: FatosQualificacao): ResultadoQualificacao {
  const reprovados: string[] = [];
  const faltando: string[] = [];

  // 1. Tem imóvel pra dar em garantia (não só "quer comprar")
  if (f.temImovelGarantia === false) reprovados.push("não possui imóvel para dar em garantia");
  else if (f.temImovelGarantia == null) faltando.push("se possui imóvel para garantia");

  // 2. Crédito ≥ piso de reunião
  if (f.valorCreditoCentavos == null) faltando.push("valor do crédito");
  else if (f.valorCreditoCentavos < REUNIAO_MIN_CREDITO_CENTAVOS)
    reprovados.push("crédito abaixo de R$ 100.000");

  // 3. LTV ≤ 60% (precisa do valor do imóvel)
  if (f.valorImovelCentavos == null || f.valorImovelCentavos <= 0) {
    faltando.push("valor do imóvel (para o LTV)");
  } else if (f.valorCreditoCentavos != null) {
    const ltv = f.valorCreditoCentavos / f.valorImovelCentavos;
    if (ltv > LTV_MAX) reprovados.push(`LTV ${Math.round(ltv * 100)}% acima de 60%`);
  }

  // 4. Imóvel regularizado
  if (f.imovelRegularizado == null) faltando.push("se o imóvel está regularizado");
  else if (f.imovelRegularizado !== "sim") reprovados.push("imóvel não regularizado");

  // 5. Sem pendência bloqueante
  if (f.pendenciaBloqueante == null) faltando.push("se há pendência jurídica no imóvel");
  else if (f.pendenciaBloqueante === true) reprovados.push("pendência jurídica no imóvel");

  // 6. Se financiado: saldo devedor abaixo de 50% do valor do imóvel — mesma
  //    régua do funil (unificação de 09/07/2026; antes reunia só até 25%).
  if (ehFinanciado(f.situacaoImovel, f.saldoDevedorCentavos)) {
    if (f.saldoDevedorCentavos == null) faltando.push("saldo devedor do financiamento");
    else if (f.valorImovelCentavos && f.valorImovelCentavos > 0) {
      if (saldoForaDaPolitica(f.saldoDevedorCentavos, f.valorImovelCentavos)) {
        const pct = Math.round((f.saldoDevedorCentavos / f.valorImovelCentavos) * 100);
        reprovados.push(
          `saldo devedor ${pct}% do imóvel — no limite de ${Math.round(SALDO_MAX_RATIO * 100)}% ou acima`,
        );
      }
    }
  }

  // 7. Tipo de imóvel ≠ "Outros"
  if (f.tipoImovel && f.tipoImovel.trim().toLowerCase() === TIPO_IMOVEL_MANUAL.toLowerCase()) {
    reprovados.push('tipo de imóvel "Outros" (fora da política padrão — revisar)');
  }

  return {
    qualificado: reprovados.length === 0 && faltando.length === 0,
    reprovados,
    faltando,
  };
}
