export const TASK_ACTIVE_STATUS_EXCLUDED = [
  "fechado",
  "perdido",
  "desqualificado",
  "sem_resposta",
] as const;

export type TaskStatus = "aberta" | "concluida" | "atrasada";

export type TaskRowForList = {
  id: string;
  leadId: string;
  leadNome: string;
  leadStatus: string;
  consultorId: string;
  consultorNome: string;
  titulo: string;
  descricao: string | null;
  status: TaskStatus;
  dataReferencia: string;
  venceEm: Date;
  concluidaEm: Date | null;
  acaoConclusao: string | null;
  observacaoConclusao: string | null;
  valorCreditoCentavos: number | null;
  origem: string | null;
  createdAt: Date;
};
