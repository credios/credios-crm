import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import {
  leads as leadsTable,
  parceiroComissoes,
  parceiroInteracoes,
  parceiros,
} from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { calcularComissao, criarComissaoSchema } from "@/lib/validators/comissao";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/parceiros/[id]/comissoes — registra a comissão do parceiro numa
// operação. Admin only: é custo/receita confidencial (mesma régua de
// `leads.comissao_centavos`).

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [parceiro] = await db
    .select({ id: parceiros.id })
    .from(parceiros)
    .where(eq(parceiros.id, id))
    .limit(1);
  if (!parceiro) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }
  const parsed = criarComissaoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "dados inválidos" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // A operação precisa ser uma indicação DESTE parceiro, e só uma comissão
  // por operação (também garantido pelo índice único).
  if (data.leadId) {
    const [lead] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, data.leadId), eq(leadsTable.parceiroId, id)))
      .limit(1);
    if (!lead) {
      return NextResponse.json(
        { error: "Essa operação não é uma indicação deste parceiro." },
        { status: 400 },
      );
    }
    const [jaExiste] = await db
      .select({ id: parceiroComissoes.id })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.leadId, data.leadId))
      .limit(1);
    if (jaExiste) {
      return NextResponse.json(
        { error: "Já existe comissão registrada para essa operação." },
        { status: 409 },
      );
    }
  }

  const valorCentavos =
    data.valorCentavos ?? calcularComissao(data.baseCentavos!, data.percentualBps!);

  const [criada] = await db
    .insert(parceiroComissoes)
    .values({
      parceiroId: id,
      leadId: data.leadId ?? null,
      descricao: data.descricao || null,
      baseCentavos: data.baseCentavos ?? null,
      percentualBps: data.percentualBps ?? null,
      valorCentavos,
      observacao: data.observacao || null,
      createdBy: user.id,
    })
    .returning({ id: parceiroComissoes.id });

  // Timeline do parceiro é visível ao consultor responsável — sem valores.
  await db.insert(parceiroInteracoes).values({
    parceiroId: id,
    autorId: user.id,
    tipo: "evento_sistema",
    conteudo: "Comissão registrada.",
    metadata: { kind: "comissao_registrada", comissaoId: criada!.id },
  });

  void logAction(
    null,
    user.id,
    "parceiro_comissao_criada",
    "parceiro",
    id,
    { comissaoId: criada!.id, leadId: data.leadId ?? null, valor: formatBrlFromCents(valorCentavos) },
    extractRequestMeta(request),
  );

  return NextResponse.json({ data: { id: criada!.id } }, { status: 201 });
}
