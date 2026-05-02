import { and, desc, eq, lt } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  interacoes,
  leads as leadsTable,
  users as usersTable,
} from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { resolveSlaAlertsForLead } from "@/lib/sla/check";
import { createInteracaoSchema } from "@/lib/validators/lead";

type Ctx = { params: Promise<{ id: string }> };

const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/leads/[id]/interacoes?before=ISO_DATE&limit=30
 *
 * Pagina pra trás (mais antigas) a partir do cursor `before`. Sem cursor,
 * retorna a primeira página (mais recentes). Marketing bloqueado.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil === "marketing") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [lead] = await db
    .select({ id: leadsTable.id, consultorId: leadsTable.consultorId })
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead.read", { type: "lead", consultorId: lead.consultorId })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const beforeRaw = url.searchParams.get("before");
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(
    Number.parseInt(limitRaw ?? String(PAGE_SIZE), 10) || PAGE_SIZE,
    MAX_PAGE_SIZE,
  );

  let beforeDate: Date | null = null;
  if (beforeRaw) {
    const t = Date.parse(beforeRaw);
    if (!Number.isFinite(t)) {
      return NextResponse.json({ error: "invalid before cursor" }, { status: 400 });
    }
    beforeDate = new Date(t);
  }

  const conds = [eq(interacoes.leadId, id)];
  if (beforeDate) conds.push(lt(interacoes.criadoEm, beforeDate));

  const rows = await db
    .select({
      id: interacoes.id,
      tipo: interacoes.tipo,
      conteudo: interacoes.conteudo,
      metadata: interacoes.metadata,
      criadoEm: interacoes.criadoEm,
      autorId: interacoes.autorId,
      autorNome: usersTable.nome,
    })
    .from(interacoes)
    .leftJoin(usersTable, eq(usersTable.id, interacoes.autorId))
    .where(and(...conds))
    .orderBy(desc(interacoes.criadoEm))
    .limit(limit);

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      criadoEm: r.criadoEm.toISOString(),
    })),
    hasMore: rows.length === limit,
  });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "interacao.create", {
      type: "lead",
      consultorId: lead.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = createInteracaoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const now = new Date();
  const [created] = await db
    .insert(interacoes)
    .values({
      leadId: id,
      autorId: user.id,
      tipo: data.tipo,
      conteudo: data.conteudo ?? null,
      metadata: (data.metadata ?? null) as never,
      criadoEm: now,
    })
    .returning();

  // Atualiza ultimo_contato.
  await db
    .update(leadsTable)
    .set({ ultimoContato: now })
    .where(eq(leadsTable.id, id));

  // Auto-resolve SLA ativos (interação manual indica que o lead foi atendido).
  const resolvedCount = await resolveSlaAlertsForLead(id);

  after(() =>
    logAction(
      null,
      user.id,
      "interacao_criada",
      "lead",
      id,
      {
        interacaoId: created.id,
        tipo: data.tipo,
        slaResolved: resolvedCount,
      },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json(
    {
      data: {
        ...created,
        criadoEm: created.criadoEm.toISOString(),
        autorNome: user.nome,
      },
    },
    { status: 201 },
  );
}
