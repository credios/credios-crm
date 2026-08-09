// ═══════════════════════════════════════════════════════════════════════
// POLÍTICA DE CRÉDITO — FONTE ÚNICA no CRM (unificação de 09/07/2026).
//
// Dois níveis INTENCIONAIS de régua:
//
//   Nível FUNIL — o mínimo pra ser um lead da Credios. Aplicado pelo SITE
//   na pré-qualificação (espelho em src/lib/qualificacao.ts do repo
//   credios-website-v2 — mudou aqui, mude lá) e reaproveitado aqui pelo
//   gate de consulta automática de score.
//
//   Nível REUNIÃO — régua mais alta pra ganhar reunião automática (agenda
//   pública na tela de sucesso + oferta de horários da Heloísa). Quem fica
//   entre os dois níveis segue vivo no funil, em análise manual.
//
// Consumidores: src/lib/sdr/qualificacao.ts (Heloísa), src/lib/agenda/
// prequal.ts (agenda pública), src/lib/score/gate.ts (score automático).
// Testes que travam os valores: tests/politica-credito.test.ts,
// tests/qualificacao.test.ts, tests/agenda-publica.test.ts.
// ═══════════════════════════════════════════════════════════════════════

// ── Nível FUNIL ──────────────────────────────────────────────────────────
export const FUNIL_MIN_IMOVEL_CENTAVOS = 30_000_000; // R$ 300 mil
export const FUNIL_MIN_CREDITO_CENTAVOS = 7_500_000; // R$ 75 mil
export const FUNIL_MIN_RENDA_TITULAR_CENTAVOS = 500_000; // R$ 5 mil
export const FUNIL_MIN_RENDA_COM_CONJUGE_CENTAVOS = 800_000; // R$ 8 mil (soma)
/** Saldo devedor igual ou acima desta fração do valor do imóvel → fora da política. */
export const SALDO_MAX_RATIO = 0.5;

// ── Nível REUNIÃO ────────────────────────────────────────────────────────
export const REUNIAO_MIN_CREDITO_CENTAVOS = 10_000_000; // R$ 100 mil
export const LTV_MAX = 0.6; // crédito ≤ 60% do valor do imóvel
/** Score QUOD abaixo disto → reunião suprimida (lead segue pra análise manual). */
export const SCORE_MINIMO_REUNIAO = 650;

// ── Nível SINAL DE MÍDIA (conversão enviada a Google Ads / Meta) ─────────
/**
 * Score QUOD abaixo disto → a CONVERSÃO não é disparada para as plataformas
 * de anúncio. O lead entra no CRM normalmente e é atendido como qualquer
 * outro; o que muda é só o sinal que ensina o algoritmo.
 *
 * Corte mais baixo que o de reunião (650) de propósito: são decisões
 * diferentes. Suprimir reunião é sobre onde gastar a hora do consultor —
 * pode ser conservador. Suprimir conversão é sobre o que a plataforma
 * aprende: errar para o lado restritivo aqui apaga sinal bom e cega a
 * otimização, então o corte fica onde o lead é claramente ruim.
 *
 * Pedido do owner em 09/08/2026, depois da auditoria da 1ª campanha de Meta:
 * o Advantage+ estava sendo treinado com formulário preenchido por classe
 * D/E sem patrimônio, e perseguia mais gente igual.
 */
export const SCORE_MINIMO_CONVERSAO = 600;

/**
 * O lead pode virar CONVERSÃO nas plataformas de anúncio?
 *
 * FAIL-OPEN por decisão explícita: sem score (sem CPF, fora dos critérios de
 * consulta, ou API da Direct Data fora do ar) o sinal é disparado. O modo de
 * falha importa muito aqui — fechar por padrão transformaria uma indisponi-
 * bilidade do fornecedor em "as campanhas pararam de converter", estrago bem
 * maior e muito mais difícil de diagnosticar do que deixar passar alguns
 * leads ruins.
 *
 * Vive aqui (e não no score/gate) porque é política pura, sem I/O: o gate
 * importa `server-only` e não é testável fora do runtime do servidor.
 */
export function scoreLiberaConversao(score: number | null): boolean {
  return score == null || score >= SCORE_MINIMO_CONVERSAO;
}

// ── Regras compartilhadas ────────────────────────────────────────────────

/**
 * Renda qualifica (nível funil)? Titular ≥ R$ 5 mil passa sozinho; abaixo
 * disso, só compondo com cônjuge e a soma atingindo R$ 8 mil. Mesma regra
 * do site (rendaQualifica em qualificacao.ts de lá).
 */
export function rendaQualificaCentavos(
  rendaTitularCentavos: number,
  rendaConjugeCentavos = 0,
): boolean {
  if (rendaTitularCentavos >= FUNIL_MIN_RENDA_TITULAR_CENTAVOS) return true;
  return (
    rendaConjugeCentavos > 0 &&
    rendaTitularCentavos + rendaConjugeCentavos >= FUNIL_MIN_RENDA_COM_CONJUGE_CENTAVOS
  );
}

/** Saldo devedor igual ou superior a 50% do valor do imóvel → fora da política. */
export function saldoForaDaPolitica(
  saldoDevedorCentavos: number,
  valorImovelCentavos: number,
): boolean {
  return (
    valorImovelCentavos > 0 && saldoDevedorCentavos >= valorImovelCentavos * SALDO_MAX_RATIO
  );
}
