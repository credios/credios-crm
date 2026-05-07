export const ESTADOS_CIVIS = [
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "Viúvo(a)",
  "União Estável",
] as const;

export const OCUPACOES = [
  "CLT",
  "Autônomo",
  "Empresário",
  "Servidor Público",
  "Aposentado",
  "Outro",
] as const;

export const OBJETIVOS_CREDITO = [
  "Quitar Dívidas",
  "Capital de Giro",
  "Investimento",
  "Reforma",
  "Outro",
] as const;

export const TIPOS_IMOVEL = [
  "Casa",
  "Apartamento",
  "Comercial",
  "Terreno",
  "Rural",
] as const;

export const SITUACOES_IMOVEL = [
  "Quitado",
  "Financiado",
  "Em Inventário",
  "Outro",
] as const;

export const TIPOS_PESSOA = ["Pessoa Física", "Pessoa Jurídica"] as const;

export const ORIGENS = [
  "Manual",
  "Google",
  "Instagram",
  "Facebook",
  "YouTube",
  "Orgânico",
  "Indicação",
  "LinkedIn",
  "ChatGPT",
  "Condomínio",
] as const;

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export const STATUS_LEAD_LABEL: Record<string, string> = {
  novo: "Novo",
  conversa_inicial: "Conversa inicial",
  aguardando_resposta: "Aguardando resposta",
  aguardando_documentacao: "Aguardando documentação",
  documentacao_enviada: "Documentação enviada",
  em_negociacao: "Em negociação",
  fechado: "Fechado",
  perdido: "Perdido",
  desqualificado: "Desqualificado",
};

// Motivos pra DESQUALIFICAR um lead — quando ele já entra fora da
// política ou sem condições básicas. É um "não-qualificado a priori":
// imóvel/renda/localização/restrições não cabem na nossa esteira.
export const MOTIVOS_DESQUALIFICACAO = [
  "Imóvel não atende critérios",
  "Renda insuficiente",
  "Localização fora da política",
  "LTV muito alto",
  "Restrições no nome",
  "Documentação irregular",
  "Lead duplicado",
  "Dados incorretos / falsos",
  "Outro",
] as const;

// Motivos pra marcar um lead como PERDIDO — ele era qualificado e
// chegou a entrar no funil, mas não fechou. Diferente de desqualificado:
// aqui já houve esforço comercial.
export const MOTIVOS_PERDIDO = [
  "Cliente desistiu",
  "Taxa não competitiva",
  "Já fechou com concorrente",
  "Sem retorno após várias tentativas",
  "Sem resposta",
  "Mudou de planos",
  "Outro",
] as const;

export const BANCOS_PARCEIROS = [
  "Bradesco",
  "Itaú",
  "Santander",
  "C6",
  "Banco Inter",
  "Galleria",
  "Cashme",
  "Creditas",
  "Banco Bari",
  "Daycoval",
] as const;

export const STATUS_PROPOSTA_BANCO_LABEL: Record<string, string> = {
  enviado: "Enviado",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  recusado: "Recusado",
  pendencia: "Pendência",
  proposta_emitida: "Proposta emitida",
};

export const ACAO_TAREFA_LABEL: Record<string, string> = {
  liguei: "Liguei para o lead",
  enviei_whatsapp: "Enviei WhatsApp",
  recebi_resposta: "Recebi resposta do lead",
  cobrei_documentacao: "Cobrei documentação",
  atualizei_retorno_banco: "Atualizei o lead sobre retorno do banco",
  atualizei_banco_parceiro: "Atualizei banco/parceiro da proposta",
  cliente_pediu_retorno: "Cliente pediu retorno futuro",
  nao_consegui_contato: "Não consegui contato",
  outro: "Outro",
};

export const STATUS_TAREFA_LABEL: Record<string, string> = {
  aberta: "Aberta",
  concluida: "Concluída",
  atrasada: "Atrasada",
};
