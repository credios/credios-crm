import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { parceiroComissoes } from "../../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { atualizarComissaoSchema } from "@/lib/validators/comissao";

type Ctx = { params: Promise<{ id: string; comissaoId: string }> };

// PATCH /api/parceiros/[id]/comissoes/[comissaoId] — muda o status (a pagar,
// paga com data, cancelada) ou a observação. Admin only. Valor não é editável:
// errou, cancela e registra de novo — o histórico fica íntegro.

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id, comissaoId } = await params;
  const [atual] = await db
    .select()
    .from(parceiroComissoes)
    .where(and(eq(parceiroComissoes.id, comissaoId), eq(parceiroComissoes.parceiroId, id)))
    .limit(1);
  if (!atual) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }
  const parsed = atualizarComissaoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "dados inválidos" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (atual.status === "paga" && data.status && data.status !== "paga") {
    return NextResponse.json(
      { error: "Comissão já paga não volta de status." },
      { status: 409 },
    );
  }

  const set: Partial<typeof parceiroComissoes.$inferInsert> = { updatedAt: new Date() };
  if (data.status) {
    set.status = data.status;
    set.pagoEm = data.status === "paga" ? (data.pagoEm ?? null) : null;
    // Cancelada libera a operação pra um novo registro (índice único por lead).
    if (data.status === "cancelada") set.leadId = null;
  }
  if (data.observacao !== undefined) set.observacao = data.observacao || null;

  await db.update(parceiroComissoes).set(set).where(eq(parceiroComissoes.id, comissaoId));

  void logAction(
    null,
    user.id,
    "parceiro_comissao_editada",
    "parceiro",
    id,
    { comissaoId, de: atual.status, para: data.status ?? atual.status },
    extractRequestMeta(request),
  );

  return NextResponse.json({ ok: true });
}
