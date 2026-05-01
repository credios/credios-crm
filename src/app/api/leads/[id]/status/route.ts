import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { interacoes, leads as leadsTable } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { updateStatusSchema } from "@/lib/validators/lead";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead.change_status", {
      type: "lead",
      consultorId: existing.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Reabertura de lead fechado: somente admin (CLAUDE.md §6.5).
  if (existing.status === "fechado" && user.perfil !== "admin") {
    return NextResponse.json(
      { error: "lead fechado só pode ser reaberto por admin" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = updateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const updates: Record<string, unknown> = { status: data.status };
  let extraMeta: Record<string, unknown> = {};
  if (data.status === "fechado") {
    updates.bancoAprovador = data.bancoAprovador;
    updates.valorLiberadoCentavos = data.valorLiberadoCentavos;
    updates.comissaoCentavos = data.comissaoCentavos;
    updates.dataFechamento = data.dataFechamento;
    updates.motivoDesqualificacao = null;
    extraMeta = {
      banco: data.bancoAprovador,
      valor_liberado_centavos: data.valorLiberadoCentavos,
      comissao_centavos: data.comissaoCentavos,
      data_fechamento: data.dataFechamento,
    };
  } else if (data.status === "desqualificado" || data.status === "perdido") {
    updates.motivoDesqualificacao = data.motivoDesqualificacao;
    // Limpa dados financeiros caso vinha de fechado.
    updates.bancoAprovador = null;
    updates.valorLiberadoCentavos = null;
    updates.comissaoCentavos = null;
    updates.dataFechamento = null;
    extraMeta = { motivo: data.motivoDesqualificacao };
  } else {
    updates.motivoDesqualificacao = null;
    updates.bancoAprovador = null;
    updates.valorLiberadoCentavos = null;
    updates.comissaoCentavos = null;
    updates.dataFechamento = null;
  }

  const [updated] = await db
    .update(leadsTable)
    .set(updates)
    .where(eq(leadsTable.id, id))
    .returning();

  await db.insert(interacoes).values({
    leadId: id,
    autorId: user.id,
    tipo: "mudanca_status",
    conteudo: `Status alterado de ${existing.status} para ${data.status}`,
    metadata: { de: existing.status, para: data.status, ...extraMeta } as never,
  });

  void logAction(
    null,
    user.id,
    "lead_status_mudou",
    "lead",
    id,
    { de: existing.status, para: data.status, ...extraMeta },
    extractRequestMeta(request),
  );

  return NextResponse.json({ data: updated });
}
