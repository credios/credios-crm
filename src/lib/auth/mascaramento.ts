import type { Perfil } from "./types";

// ============================================================================
// Política de visibilidade por perfil
// ============================================================================
//
// PII do lead (CPF, WhatsApp, e-mail, renda declarada, score QUOD, cadastro PF
// do bureau): visível pra TODOS os perfis, marketing incluído. O perfil
// 'marketing' nasceu com esses campos mascarados (CLAUDE.md §5), mas na prática
// marketing precisa de score e renda pra medir QUALIDADE de lead por campanha —
// sem isso não dá pra saber se a campanha traz gente que passa na política de
// crédito. Decisão do owner (2026-08-11) que sobrepõe o §5 original.
//
// O que continua restrito é receita da empresa, e em dois níveis:
//  - comissão recebida: admin only (spread por banco é confidencial);
//  - banco aprovador + valor liberado: admin e marketing (marketing precisa do
//    ticket fechado por campanha pra calcular retorno); gerente e consultor
//    seguem sem ver.

/** Comissão recebida = receita da empresa. Admin only. */
export function canSeeComissao(perfil: Perfil): boolean {
  return perfil === "admin";
}

/**
 * Banco aprovador e valor liberado da operação fechada. Admin e marketing
 * (marketing atribui ticket fechado à campanha de origem).
 */
export function canSeeFechamento(perfil: Perfil): boolean {
  return perfil === "admin" || perfil === "marketing";
}

export type LeadLikeForMasking = {
  bancoAprovador?: string | null;
  valorLiberadoCentavos?: number | null;
  comissaoCentavos?: number | null;
};

/**
 * Aplica a política acima sobre uma linha de lead vinda do banco.
 *
 * Nenhum campo de PII é mascarado — o que sai daqui diferente do que entrou é
 * só o bloco de fechamento:
 *  - comissaoCentavos: null pra todo perfil que não é admin;
 *  - bancoAprovador / valorLiberadoCentavos: null pra gerente e consultor;
 *  - rawPayload: null pra quem não é admin (campo de debug do webhook, sem UI).
 */
export function maskLeadForPerfil<T extends LeadLikeForMasking>(
  lead: T,
  perfil: Perfil,
): T {
  let out: T = lead;

  // raw_payload é o JSON bruto do webhook — campo de debug, sem tela. Só admin.
  if (perfil !== "admin" && "rawPayload" in out) {
    out = { ...out, rawPayload: null };
  }

  if (!canSeeFechamento(perfil)) {
    out = { ...out, bancoAprovador: null, valorLiberadoCentavos: null };
  }

  if (!canSeeComissao(perfil)) {
    out = { ...out, comissaoCentavos: null };
  }

  return out;
}
