// Etapas PÚBLICAS de uma indicação — o que o parceiro enxerga. O funil interno
// (status do consultor) é mais fino e tem nomes de trabalho; aqui ele é
// resumido em poucas etapas com texto que serve pra qualquer produto.

export const ETAPAS = [
  "recebida",
  "em_analise",
  "documentacao",
  "em_credito",
  "liberada",
  "nao_aprovada",
  "cancelada",
] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_META: Record<
  Etapa,
  { label: string; descricao: string; tom: "info" | "sucesso" | "alerta" | "neutro" }
> = {
  recebida: {
    label: "Indicação recebida",
    descricao: "Recebemos a indicação. Nossa equipe entra em contato com o cliente em até 1 dia útil.",
    tom: "info",
  },
  em_analise: {
    label: "Em análise",
    descricao: "Estamos conversando com o cliente e analisando o perfil da operação.",
    tom: "info",
  },
  documentacao: {
    label: "Documentação",
    descricao: "Coletando e conferindo os documentos necessários para a análise de crédito.",
    tom: "info",
  },
  em_credito: {
    label: "Análise de crédito",
    descricao: "A proposta está em análise de crédito. Negociamos as melhores condições para o cliente.",
    tom: "alerta",
  },
  liberada: {
    label: "Crédito liberado",
    descricao: "O crédito foi liberado ao cliente.",
    tom: "sucesso",
  },
  nao_aprovada: {
    label: "Não aprovada",
    descricao: "A operação não foi aprovada. Agradecemos a indicação — o próximo cliente pode ter outro resultado.",
    tom: "neutro",
  },
  cancelada: {
    label: "Cancelada",
    descricao: "A operação foi encerrada sem conclusão.",
    tom: "neutro",
  },
};

/** Etapas do caminho feliz, em ordem — pra desenhar o progresso. */
export const ETAPAS_FUNIL: Etapa[] = [
  "recebida",
  "em_analise",
  "documentacao",
  "em_credito",
  "liberada",
];

const MAPA: Record<string, Etapa> = {
  novo: "recebida",
  conversa_inicial: "em_analise",
  aguardando_resposta: "em_analise",
  reuniao_agendada: "em_analise",
  aguardando_documentacao: "documentacao",
  documentacao_enviada: "em_credito",
  aguardando_cadastro: "em_credito",
  em_negociacao: "em_credito",
  fechado: "liberada",
  desqualificado: "nao_aprovada",
  perdido: "cancelada",
};

/**
 * Status interno do lead → etapa pública. Status custom criado pelo admin
 * (o campo é livre) cai em "em análise": nunca vaza nome interno pro parceiro.
 */
export function etapaDoStatus(status: string): Etapa {
  return MAPA[status] ?? "em_analise";
}

export function etapaEncerrada(etapa: Etapa): boolean {
  return etapa === "liberada" || etapa === "nao_aprovada" || etapa === "cancelada";
}
