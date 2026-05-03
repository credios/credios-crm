import "server-only";

import { and, asc, desc, eq, notInArray } from "drizzle-orm";

import { leads as leadsTable } from "../../../db/schema";
import { db } from "@/lib/db";

export type LeadAtivoConsultor = {
  id: string;
  nome: string;
  status: string;
  origem: string | null;
  cidade: string | null;
  estado: string | null;
  valorCreditoCentavos: number | null;
  ultimoContato: Date | null;
  createdAt: Date;
  atribuidoEm: Date | null;
};

/**
 * Lista leads ATIVOS (não terminais) atribuídos a um consultor específico.
 * Usado pelo overview admin de cada consultor.
 *
 * Inclui sem_resposta (consultor pode tentar reativar) mas exclui
 * fechado/perdido/desqualificado (já saíram do funil).
 */
export async function listLeadsAtivosByConsultor(
  consultorId: string,
): Promise<LeadAtivoConsultor[]> {
  return db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      ultimoContato: leadsTable.ultimoContato,
      createdAt: leadsTable.createdAt,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        notInArray(leadsTable.status, [
          "fechado",
          "perdido",
          "desqualificado",
        ]),
      ),
    )
    .orderBy(asc(leadsTable.status), desc(leadsTable.createdAt))
    .limit(500);
}
