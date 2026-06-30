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
// Limiares aqui como constantes (fáceis de ajustar; viram tela na Fase 3).

const PISO_CREDITO_CENTAVOS = 10_000_000; // R$ 100.000
const LTV_MAX = 0.6; // 60%
const SALDO_MAX_PCT = 0.25; // 25% do valor do imóvel, se financiado
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

  // 2. Crédito ≥ piso
  if (f.valorCreditoCentavos == null) faltando.push("valor do crédito");
  else if (f.valorCreditoCentavos < PISO_CREDITO_CENTAVOS)
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

  // 6. Se financiado: saldo devedor ≤ 25% do valor do imóvel
  if (ehFinanciado(f.situacaoImovel, f.saldoDevedorCentavos)) {
    if (f.saldoDevedorCentavos == null) faltando.push("saldo devedor do financiamento");
    else if (f.valorImovelCentavos && f.valorImovelCentavos > 0) {
      const pct = f.saldoDevedorCentavos / f.valorImovelCentavos;
      if (pct > SALDO_MAX_PCT)
        reprovados.push(`saldo devedor ${Math.round(pct * 100)}% acima de 25% do imóvel`);
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
