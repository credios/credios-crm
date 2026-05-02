import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { auditLog, users as usersTable } from "../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { auditQuerySchema } from "@/lib/validators/audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = auditQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const q = parsed.data;

  const conds = [];
  if (q.usuarioId) conds.push(eq(auditLog.usuarioId, q.usuarioId));
  if (q.acao) conds.push(ilike(auditLog.acao, `%${q.acao}%`));
  if (q.recursoTipo) conds.push(eq(auditLog.recursoTipo, q.recursoTipo));
  if (q.dataDe)
    conds.push(gte(auditLog.criadoEm, new Date(`${q.dataDe}T00:00:00Z`)));
  if (q.dataAte)
    conds.push(lte(auditLog.criadoEm, new Date(`${q.dataAte}T23:59:59Z`)));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const offset = (q.page - 1) * q.pageSize;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        acao: auditLog.acao,
        recursoTipo: auditLog.recursoTipo,
        recursoId: auditLog.recursoId,
        metadata: auditLog.metadata,
        ip: auditLog.ip,
        userAgent: auditLog.userAgent,
        criadoEm: auditLog.criadoEm,
        usuarioId: auditLog.usuarioId,
        usuarioNome: usersTable.nome,
        usuarioEmail: usersTable.email,
      })
      .from(auditLog)
      .leftJoin(usersTable, eq(usersTable.id, auditLog.usuarioId))
      .where(where)
      .orderBy(desc(auditLog.criadoEm))
      .limit(q.pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where),
  ]);

  const total = totals[0]?.total ?? 0;
  return NextResponse.json({
    data: rows,
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    },
  });
}
