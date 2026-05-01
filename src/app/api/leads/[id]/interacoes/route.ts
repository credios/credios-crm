import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { interacoes, leads as leadsTable } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { createInteracaoSchema } from "@/lib/validators/lead";

type Ctx = { params: Promise<{ id: string }> };

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

  // Atualiza ultimo_contato e resolve alertas de SLA pendentes.
  await db
    .update(leadsTable)
    .set({ ultimoContato: now })
    .where(eq(leadsTable.id, id));

  void logAction(
    null,
    user.id,
    "interacao_criada",
    "lead",
    id,
    { interacaoId: created.id, tipo: data.tipo },
    extractRequestMeta(request),
  );

  return NextResponse.json({ data: created }, { status: 201 });
}
