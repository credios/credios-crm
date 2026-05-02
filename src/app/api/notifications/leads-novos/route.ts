import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { leads as leadsTable, users as usersTable } from "../../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Sino de notificações: alerta de NOVOS LEADS chegando.
 *
 * Scope por perfil:
 *  - admin/gerente: todos os leads novos das últimas 24h (status='novo')
 *  - consultor: só leads novos atribuídos a ele nas últimas 24h
 *  - marketing: bloqueado (sem ações operacionais)
 *
 * Limite 50 itens. Janela 24h pra não acumular indefinido — depois disso o
 * lead aparece naturalmente na lista; o sino é pra "atenção imediata".
 */
export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil === "marketing") {
    return NextResponse.json({ data: [] });
  }

  // Lê o último "marcar como lido" do user pra calcular badge de NÃO lidos.
  // Total bruto (lista exibida no dropdown) ainda usa janela de 24h —
  // queremos histórico visível mesmo que tudo já tenha sido lido.
  const [me] = await db
    .select({ seenAt: usersTable.notificationsSeenAt })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);
  const seenAt = me?.seenAt ?? null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const conds = [
    eq(leadsTable.status, "novo"),
    gte(leadsTable.createdAt, since),
  ];
  if (user.perfil === "consultor") {
    conds.push(eq(leadsTable.consultorId, user.id));
  }

  const rows = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      origem: leadsTable.origem,
      consultorId: leadsTable.consultorId,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      createdAt: leadsTable.createdAt,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(leadsTable)
    .where(and(...conds))
    .orderBy(desc(leadsTable.createdAt))
    .limit(50);

  // Conta NÃO LIDOS (created_at > seen_at, ou tudo se nunca marcou)
  // pra UI mostrar badge vermelho só quando tem coisa nova de verdade.
  const unreadConds = [...conds];
  if (seenAt) unreadConds.push(gt(leadsTable.createdAt, seenAt));
  const [unreadRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(and(...unreadConds));
  const unreadCount = unreadRow?.count ?? 0;

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      atribuidoEm: r.atribuidoEm?.toISOString() ?? null,
      // Pra consultor, indica se é "atribuído a você" (vs pool — caso eventual).
      assignedToMe:
        user.perfil === "consultor" ? r.consultorId === user.id : false,
      // Não-lido se created_at > seen_at, ou tudo se nunca marcou como lido.
      unread: !seenAt || r.createdAt > seenAt,
    })),
    perfil: user.perfil,
    unreadCount,
    seenAt: seenAt?.toISOString() ?? null,
  });
}
