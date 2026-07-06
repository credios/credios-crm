// Pré-qualificação DETERMINÍSTICA da agenda pública (tela de sucesso do
// simulador). Diferente da qualificação conversacional da Heloísa: aqui só
// entram critérios calculáveis a partir do próprio formulário — quem passa
// pode escolher um horário na agenda do consultor direto na página.
// Critérios definidos pelo owner em 2026-07-06.

const PISO_CREDITO_CENTAVOS = 10_000_000; // R$ 100.000
const PISO_IMOVEL_CENTAVOS = 30_000_000; // R$ 300.000
const PISO_RENDA_CENTAVOS = 600_000; // R$ 6.000
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
};

/** O lead pode ver a agenda pública? Todos os critérios precisam passar. */
export function elegivelAgendaPublica(l: LeadPrequal): boolean {
  if ((l.valorCreditoCentavos ?? 0) < PISO_CREDITO_CENTAVOS) return false;
  if ((l.valorImovelCentavos ?? 0) < PISO_IMOVEL_CENTAVOS) return false;
  if ((l.rendaMensalCentavos ?? 0) < PISO_RENDA_CENTAVOS) return false;
  if (!l.tipoImovel || !TIPOS_ACEITOS.has(normalizar(l.tipoImovel))) return false;
  return true;
}

/** E-mail do consultor dono da agenda, pelo valor do crédito (> R$ 500k → Gabriel). */
export function consultorAgendaEmail(valorCreditoCentavos: number | null): string {
  return (valorCreditoCentavos ?? 0) > CREDITO_LIMITE_GABRIEL_CENTAVOS
    ? AGENDA_CONSULTOR_ALTO
    : AGENDA_CONSULTOR_PADRAO;
}
