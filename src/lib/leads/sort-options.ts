export const SORT_LEAD_KEYS = [
  "criado_em",
  "atualizado_em",
  "ultimo_contato",
  "nome",
  "valor_credito",
  "status",
  "origem",
] as const;

export type SortLeadKey = (typeof SORT_LEAD_KEYS)[number];
