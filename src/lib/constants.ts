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
  sem_resposta: "Sem resposta",
  desqualificado: "Desqualificado",
};

export const MOTIVOS_DESQUALIFICACAO = [
  "Imóvel não atende critérios",
  "Renda insuficiente",
  "Localização fora da política",
  "LTV muito alto",
  "Restrições no nome",
  "Cliente desistiu",
  "Taxa não competitiva",
  "Já fechou com concorrente",
  "Documentação irregular",
  "Outro",
] as const;
