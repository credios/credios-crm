import { z } from "zod";

/**
 * Produtos aceitos em `leads.produto` (CHECK na migration 0048).
 *
 * `FINANCIAMENTO` existe só porque o Portal de Parceiros já o oferece no
 * formulário de indicação — o CRM guarda o lead, mas não há fluxo próprio.
 * A UI trabalha com `PRODUTOS_ATIVOS`.
 */
export const PRODUTOS = ["CGI", "CONDOMINIO", "FINANCIAMENTO"] as const;
export type Produto = (typeof PRODUTOS)[number];

export const PRODUTOS_ATIVOS = ["CGI", "CONDOMINIO"] as const satisfies readonly Produto[];

export const PRODUTO_PADRAO: Produto = "CGI";

export const PRODUTO_LABEL: Record<Produto, string> = {
  CGI: "Crédito com garantia de imóvel",
  CONDOMINIO: "Crédito para condomínio",
  FINANCIAMENTO: "Financiamento imobiliário",
};

export const PRODUTO_LABEL_CURTO: Record<Produto, string> = {
  CGI: "CGI",
  CONDOMINIO: "Condomínio",
  FINANCIAMENTO: "Financiamento",
};

const ALIASES: Record<string, Produto> = {
  CGI: "CGI",
  HOMEEQUITY: "CGI",
  CONDOMINIO: "CONDOMINIO",
  CONDOMINIOS: "CONDOMINIO",
  FINANCIAMENTO: "FINANCIAMENTO",
};

/**
 * Canoniza o produto vindo de fora (site, portal, form). Ausente/vazio = CGI
 * (comportamento histórico); valor desconhecido = null, pra o chamador
 * rejeitar em vez de gravar um lead num produto que não existe.
 */
export function normalizarProduto(raw: string | null | undefined): Produto | null {
  if (raw == null || raw.trim() === "") return PRODUTO_PADRAO;
  const chave = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
  return ALIASES[chave] ?? null;
}

/** Campo Zod de produto: aceita ausente (→ CGI) e variações de grafia. */
export const produtoSchema = z
  .string()
  .nullish()
  .transform((v, ctx): Produto => {
    const p = normalizarProduto(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Produto inválido" });
      return z.NEVER;
    }
    return p;
  });

/**
 * As automações do funil de pessoa física — Heloísa, score por CPF, agenda
 * pública, portal de documentos, proposta/simulador, conversões de mídia —
 * foram desenhadas pro CGI e só rodam nele. Qualquer outro produto fica no
 * atendimento manual até ganhar fluxo próprio.
 */
export function ehCgi(lead: { produto: string | null | undefined }): boolean {
  return (lead.produto ?? PRODUTO_PADRAO) === "CGI";
}

/** Lead indicado por parceiro (portal novo, portal antigo ou vínculo manual). */
export function ehDeParceiro(lead: {
  parceiroId?: string | null;
  parceiroPortalId?: string | null;
  source?: string | null;
}): boolean {
  return (
    !!lead.parceiroId || !!lead.parceiroPortalId || lead.source === "Portal de Parceiros"
  );
}

/**
 * O lead pode receber CONTATO automatizado (Heloísa no WhatsApp, convite por
 * e-mail ao portal de documentos, agenda pública)? Só CGI que NÃO veio de
 * parceiro: cliente de parceiro é atendido apenas pelo consultor (decisão do
 * owner, 2026-10-13) — o parceiro já fez a ponte, robô por cima atrapalha a
 * relação dele. Consultas internas (score, cadastro PF) não são contato e
 * seguem a régua de `ehCgi`.
 */
export function aceitaContatoAutomatizado(lead: {
  produto: string | null | undefined;
  parceiroId?: string | null;
  parceiroPortalId?: string | null;
  source?: string | null;
}): boolean {
  return ehCgi(lead) && !ehDeParceiro(lead);
}
