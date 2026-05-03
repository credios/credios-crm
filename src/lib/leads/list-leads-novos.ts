import "server-only";

import { and, asc, desc, isNull, notInArray } from "drizzle-orm";

import { leads as leadsTable } from "../../../db/schema";
import { db } from "@/lib/db";

export type LeadNovoCard = {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  whatsapp: string | null;
  valorCreditoCentavos: number | null;
  valorImovelCentavos: number | null;
  rendaMensalCentavos: number | null;
  tipoImovel: string | null;
  origem: string | null;
  createdAt: Date;
};

/**
 * Leads sem consultor atribuído E em status NÃO terminal — pool de
 * triagem pra admin atribuir manualmente. Ordena por mais antigos
 * primeiro (FIFO de chegada — o mais antigo é o mais urgente).
 *
 * Status terminais (fechado/perdido/desqualificado/sem_resposta) são
 * excluídos: já saíram do funil ativo.
 */
export async function listLeadsNovosSemConsultor(): Promise<LeadNovoCard[]> {
  const rows = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      whatsapp: leadsTable.whatsapp,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      valorImovelCentavos: leadsTable.valorImovelCentavos,
      rendaMensalCentavos: leadsTable.rendaMensalCentavos,
      tipoImovel: leadsTable.tipoImovel,
      origem: leadsTable.origem,
      createdAt: leadsTable.createdAt,
    })
    .from(leadsTable)
    .where(
      and(
        isNull(leadsTable.consultorId),
        notInArray(leadsTable.status, [
          "fechado",
          "perdido",
          "desqualificado",
          "sem_resposta",
        ]),
      ),
    )
    .orderBy(asc(leadsTable.createdAt), desc(leadsTable.id))
    .limit(200);
  return rows;
}
