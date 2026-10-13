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
