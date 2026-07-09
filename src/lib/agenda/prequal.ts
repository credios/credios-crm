// Pré-qualificação DETERMINÍSTICA da agenda pública (tela de sucesso do
// simulador). Diferente da qualificação conversacional da Heloísa: aqui só
// entram critérios calculáveis a partir do próprio formulário — quem passa
// pode escolher um horário na agenda do consultor direto na página.
// Limiares vêm da política central (src/lib/politica-credito.ts); a renda
// segue a régua do funil (5k titular / 8k somando com cônjuge, unificação
// de 09/07/2026 — antes era 6k fixo).

import {
  FUNIL_MIN_IMOVEL_CENTAVOS,
  REUNIAO_MIN_CREDITO_CENTAVOS,
  rendaQualificaCentavos,
} from "@/lib/politica-credito";

// Acima de R$ 500k o dono do caso é o Gabriel; até 500k, Rodrigo.
const CREDITO_LIMITE_GABRIEL_CENTAVOS = 50_000_000;

export const AGENDA_CONSULTOR_ALTO = "gabriel.meirelles@credios.com.br";
export const AGENDA_CONSULTOR_PADRAO = "rodrigo@credios.com.br";

/** Tipos de imóvel aceitos na agenda pública (comparados sem acento/caixa). */
const TIPOS_ACEITOS = new Set(["apartamento", "casa de condominio", "casa de rua"]);

function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export type LeadPrequal = {
  valorCreditoCentavos: number | null;
  valorImovelCentavos: number | null;
  rendaMensalCentavos: number | null;
  tipoImovel: string | null;
  // Composição de renda com cônjuge (regra 5k/8k do funil). Opcionais pra
  // não quebrar chamadas antigas — ausentes contam como "não compõe".
  conjugeCompoeRenda?: boolean | null;
  conjugeRendaCentavos?: number | null;
};

/** O lead pode ver a agenda pública? Todos os critérios precisam passar. */
export function elegivelAgendaPublica(l: LeadPrequal): boolean {
  if ((l.valorCreditoCentavos ?? 0) < REUNIAO_MIN_CREDITO_CENTAVOS) return false;
  if ((l.valorImovelCentavos ?? 0) < FUNIL_MIN_IMOVEL_CENTAVOS) return false;
  const rendaConjuge = l.conjugeCompoeRenda === true ? (l.conjugeRendaCentavos ?? 0) : 0;
  if (!rendaQualificaCentavos(l.rendaMensalCentavos ?? 0, rendaConjuge)) return false;
  if (!l.tipoImovel || !TIPOS_ACEITOS.has(normalizar(l.tipoImovel))) return false;
  return true;
}

/** E-mail do consultor dono da agenda, pelo valor do crédito (> R$ 500k → Gabriel). */
export function consultorAgendaEmail(valorCreditoCentavos: number | null): string {
  return (valorCreditoCentavos ?? 0) > CREDITO_LIMITE_GABRIEL_CENTAVOS
    ? AGENDA_CONSULTOR_ALTO
    : AGENDA_CONSULTOR_PADRAO;
}
