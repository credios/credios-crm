// GET /api/leads/[id]/anotacoes — lista anotações do lead
// POST /api/leads/[id]/anotacoes — cria anotação

import { desc, eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  leadAnotacoes,
  leads as leadsTable,
  users as usersTable,
} from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { createAnotacaoSchema } from "@/lib/validators/anotacao";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  // Acesso: mesmo critério de ler o lead (consultor só vê leads atribuídos a ele).
  const [lead] = await db
    .select({ consultorId: leadsTable.consultorId })
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead.read", {
      type: "lead",
      consultorId: lead.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Marketing tem acesso ao lead mas NÃO às anotações (PII em texto livre).
  if (user.perfil === "marketing") {
    return NextResponse.json({ data: [] });
  }

  const rows = await db
    .select({
      id: leadAnotacoes.id,
      titulo: leadAnotacoes.titulo,
      conteudo: leadAnotacoes.conteudo,
      autorId: leadAnotacoes.autorId,
      autorNome: usersTable.nome,
      editadoEm: leadAnotacoes.editadoEm,
      editadoPor: leadAnotacoes.editadoPor,
      createdAt: leadAnotacoes.createdAt,
      updatedAt: leadAnotacoes.updatedAt,
    })
    .from(leadAnotacoes)
    .leftJoin(usersTable, eq(usersTable.id, leadAnotacoes.autorId))
    .where(eq(leadAnotacoes.leadId, id))
    .orderBy(desc(leadAnotacoes.createdAt));

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      editadoEm: r.editadoEm?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const [lead] = await db
    .select({ consultorId: leadsTable.consultorId })
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead_anotacao.create", {
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

  const parsed = createAnotacaoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(leadAnotacoes)
    .values({
      leadId: id,
      titulo: parsed.data.titulo,
      conteudo: parsed.data.conteudo,
      autorId: user.id,
    })
    .returning();

  after(() =>
    logAction(
      null,
      user.id,
      "lead_anotacao_criada",
      "lead",
      id,
      { anotacao_id: created!.id, titulo: parsed.data.titulo },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ data: created }, { status: 201 });
}
