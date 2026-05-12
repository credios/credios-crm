// PATCH /api/leads/[id]/anotacoes/[anotacaoId] — edita
// DELETE /api/leads/[id]/anotacoes/[anotacaoId] — exclui (admin only)

import { and, eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  leadAnotacoes,
  leads as leadsTable,
} from "../../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { updateAnotacaoSchema } from "@/lib/validators/anotacao";

type Ctx = { params: Promise<{ id: string; anotacaoId: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: leadId, anotacaoId } = await params;

  const [lead] = await db
    .select({ consultorId: leadsTable.consultorId })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead_anotacao.update", {
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

  const parsed = updateAnotacaoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(leadAnotacoes)
    .set({
      titulo: parsed.data.titulo,
      conteudo: parsed.data.conteudo,
      editadoEm: now,
      editadoPor: user.id,
      updatedAt: now,
    })
    .where(
      and(eq(leadAnotacoes.id, anotacaoId), eq(leadAnotacoes.leadId, leadId)),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "anotação não encontrada" }, { status: 404 });
  }

  after(() =>
    logAction(
      null,
      user.id,
      "lead_anotacao_editada",
      "lead",
      leadId,
      { anotacao_id: anotacaoId, titulo: parsed.data.titulo },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: leadId, anotacaoId } = await params;

  // Delete é admin-only (sem precisar checar consultor_id do lead).
  if (!checkPermission(user, "lead_anotacao.delete")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [deleted] = await db
    .delete(leadAnotacoes)
    .where(
      and(eq(leadAnotacoes.id, anotacaoId), eq(leadAnotacoes.leadId, leadId)),
    )
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "anotação não encontrada" }, { status: 404 });
  }

  after(() =>
    logAction(
      null,
      user.id,
      "lead_anotacao_excluida",
      "lead",
      leadId,
      {
        anotacao_id: anotacaoId,
        titulo: deleted.titulo,
        conteudo_snippet: deleted.conteudo.slice(0, 200),
      },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ deleted: true });
}
