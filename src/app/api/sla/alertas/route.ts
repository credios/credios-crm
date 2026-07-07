import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  leads as leadsTable,
  slaAlertas,
} from "../../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/sla/alertas — alertas SLA ativos (resolvido_em IS NULL).
 * Scope por perfil:
 *  - admin/gerente: todos
 *  - consultor: só dos próprios leads
 *  - marketing: bloqueado (sem notificações operacionais)
 */
export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil === "marketing") {
    return NextResponse.json({ data: [] });
  }

  const conds = [
    isNull(slaAlertas.resolvidoEm),
    // Lead encerrado não gera notificação de SLA (alerta antigo não-resolvido).
    notInArray(leadsTable.status, ["fechado", "perdido", "desqualificado"]),
  ];
  if (user.perfil === "consultor") {
    conds.push(eq(leadsTable.consultorId, user.id));
  }

  const rows = await db
    .select({
      id: slaAlertas.id,
      tipo: slaAlertas.tipo,
      disparadoEm: slaAlertas.disparadoEm,
      leadId: slaAlertas.leadId,
      leadNome: leadsTable.nome,
      leadStatus: leadsTable.status,
      consultorId: leadsTable.consultorId,
      atribuidoEm: leadsTable.atribuidoEm,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
    })
    .from(slaAlertas)
    .innerJoin(leadsTable, eq(leadsTable.id, slaAlertas.leadId))
    .where(and(...conds))
    .orderBy(desc(slaAlertas.disparadoEm))
    .limit(50);

  void sql; // silence

  return NextResponse.json({ data: rows });
}
