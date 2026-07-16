// Vocabulário do módulo de Parceiros. Pipeline deliberadamente enxuto
// (lista, sem kanban): B2B não precisa dos 10 status de cliente.

export const PARCEIRO_STATUS = [
  "novo",
  "em_contato",
  "reuniao",
  "proposta_enviada",
  "convidado_portal",
  "ativo",
  "perdido",
] as const;

export type ParceiroStatus = (typeof PARCEIRO_STATUS)[number];

export const PARCEIRO_STATUS_LABEL: Record<ParceiroStatus, string> = {
  novo: "Novo",
  em_contato: "Em contato",
  reuniao: "Reunião",
  proposta_enviada: "Proposta enviada",
  convidado_portal: "Convidado no portal",
  ativo: "Ativo",
  perdido: "Perdido",
};

/** Tons pros badges (mapeados pra classes no componente). */
export const PARCEIRO_STATUS_TONE: Record<ParceiroStatus, "neutral" | "blue" | "amber" | "violet" | "emerald" | "red"> = {
  novo: "blue",
  em_contato: "amber",
  reuniao: "violet",
  proposta_enviada: "violet",
  convidado_portal: "emerald",
  ativo: "emerald",
  perdido: "red",
};

export const PARCEIRO_TERMINAIS: ParceiroStatus[] = ["ativo", "perdido"];

// Os mesmos 6 perfis da página /parceiros do site (+ outro).
export const PARCEIRO_SEGMENTOS = [
  "corretor",
  "imobiliaria",
  "contador",
  "advogado",
  "assessor",
  "correspondente",
  "outro",
] as const;

export type ParceiroSegmento = (typeof PARCEIRO_SEGMENTOS)[number];

export const PARCEIRO_SEGMENTO_LABEL: Record<ParceiroSegmento, string> = {
  corretor: "Corretor de imóveis",
  imobiliaria: "Imobiliária",
  contador: "Contador",
  advogado: "Advogado",
  assessor: "Assessor de investimentos",
  correspondente: "Correspondente bancário",
  outro: "Outro",
};

export const PARCEIRO_ORIGENS = [
  "site",
  "indicacao",
  "prospeccao",
  "evento",
  "outro",
] as const;

export const PARCEIRO_ORIGEM_LABEL: Record<(typeof PARCEIRO_ORIGENS)[number], string> = {
  site: "Site",
  indicacao: "Indicação",
  prospeccao: "Prospecção ativa",
  evento: "Evento",
  outro: "Outro",
};

export const PARCEIRO_MOTIVOS_PERDA = [
  "sem_interesse",
  "sem_resposta",
  "perfil_inadequado",
  "concorrente",
  "condicoes_nao_atenderam",
  "outro",
] as const;

export const PARCEIRO_MOTIVO_PERDA_LABEL: Record<(typeof PARCEIRO_MOTIVOS_PERDA)[number], string> = {
  sem_interesse: "Sem interesse",
  sem_resposta: "Sem resposta",
  perfil_inadequado: "Perfil inadequado",
  concorrente: "Fechou com concorrente",
  condicoes_nao_atenderam: "Condições não atenderam",
  outro: "Outro",
};

export const PARCEIRO_INTERACAO_TIPOS = [
  "ligacao",
  "whatsapp",
  "email",
  "reuniao",
  "anotacao",
] as const;

export const PARCEIRO_INTERACAO_LABEL: Record<string, string> = {
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  reuniao: "Reunião",
  anotacao: "Anotação",
  mudanca_status: "Mudança de status",
  mudanca_atribuicao: "Atribuição",
  evento_sistema: "Sistema",
};
