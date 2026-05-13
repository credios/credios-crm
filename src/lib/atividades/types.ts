// ============================================================================
// Tipos da página /atividades (admin dashboard)
// ============================================================================
// "Atividade" = ação ativa do consultor em um lead. Vem de 2 fontes:
//   - interacoes (whatsapp, ligação, email, reunião, contato, doc, simulação)
//   - lead_anotacoes (notas livres)
//
// Excluídos: mudanças de status, reatribuições, leads criados por webhook
// (autor_id null), eventos de sistema que não são simulações.
// ============================================================================

export type AtividadeTipo =
  | "whatsapp"
  | "ligacao"
  | "email"
  | "reuniao"
  | "contato"
  | "documento_recebido"
  | "simulacao"
  | "anotacao";

export const ATIVIDADE_TIPOS: AtividadeTipo[] = [
  "whatsapp",
  "ligacao",
  "email",
  "reuniao",
  "contato",
  "documento_recebido",
  "simulacao",
  "anotacao",
];

export const ATIVIDADE_TIPO_LABEL: Record<AtividadeTipo, string> = {
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  email: "Email",
  reuniao: "Reunião",
  contato: "Contato",
  documento_recebido: "Documento recebido",
  simulacao: "Simulação gerada",
  anotacao: "Anotação",
};

export type Atividade = {
  /** ID único (id da interação ou da anotação, prefixado pra evitar colisão) */
  id: string;
  source: "interacao" | "anotacao";
  tipo: AtividadeTipo;
  /** Quando a ação aconteceu */
  hora: string; // ISO
  /** Quem fez */
  consultor: {
    id: string;
    nome: string | null;
  };
  /** Lead onde a ação foi feita */
  lead: {
    id: string;
    nome: string;
    status: string;
  };
  /** Detalhe livre (preview do conteúdo). Anotações trazem título também. */
  titulo: string | null;
  detalhe: string | null;
};

export type AtividadesKpi = {
  consultorId: string;
  consultorNome: string;
  total: number;
  porTipo: Partial<Record<AtividadeTipo, number>>;
};
