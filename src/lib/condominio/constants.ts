/** Finalidades do crédito para condomínio — gravadas em `leads.objetivo_credito`. */
export const FINALIDADES_CONDOMINIO = [
  "Obra / Reforma",
  "Fachada e pintura",
  "Elevadores",
  "Impermeabilização / Telhado",
  "Energia solar",
  "Segurança e portaria",
  "Individualização de água ou gás",
  "Quitação de dívidas",
  "Outro",
] as const;

export const ASSEMBLEIA_STATUS = [
  "nao_convocada",
  "convocada",
  "aprovada",
  "reprovada",
] as const;
export type AssembleiaStatus = (typeof ASSEMBLEIA_STATUS)[number];

export const ASSEMBLEIA_STATUS_LABEL: Record<AssembleiaStatus, string> = {
  nao_convocada: "Não convocada",
  convocada: "Convocada",
  aprovada: "Crédito aprovado em assembleia",
  reprovada: "Reprovado em assembleia",
};

const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

/**
 * Finalidade que chega de fora (site) → uma das FINALIDADES_CONDOMINIO, sem
 * diferenciar caixa/acento/pontuação. Texto que não bate vira "Outro" e o
 * original volta em `detalhe` (vai pra lead_condominio.finalidade_detalhes).
 */
export function normalizarFinalidadeCondominio(
  raw: string | null | undefined,
): { finalidade: string | null; detalhe: string | null } {
  const t = raw?.trim();
  if (!t) return { finalidade: null, detalhe: null };
  const achada = FINALIDADES_CONDOMINIO.find((f) => chave(f) === chave(t));
  return achada ? { finalidade: achada, detalhe: null } : { finalidade: "Outro", detalhe: t };
}
