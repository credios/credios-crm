import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { parceiroInteracoes, parceiros } from "../../../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { PARCEIRO_INTERACAO_TIPOS } from "@/lib/parceiros/constants";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/parceiros/[id]/interacoes — registra contato manual e atualiza
// ultimo_contato (o que resolve o card de SLA/esfriando na Mesa).
// Conteúdo é OPCIONAL — mesmo princípio dos leads: registrar o contato
// vale mais que exigir descrição.

const createSchema = z.object({
  tipo: z.enum(PARCEIRO_INTERACAO_TIPOS),
  conteudo: z.string().max(4000).optional().nullable(),
});

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil === "marketing") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [parceiro] = await db
    .select({ id: parceiros.id, consultorId: parceiros.consultorId })
    .from(parceiros)
    .where(eq(parceiros.id, id))
    .limit(1);
  if (!parceiro || (!isAdminOrGerente(user) && parceiro.consultorId !== user.id)) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  }

  const agora = new Date();
  await db.insert(parceiroInteracoes).values({
    parceiroId: id,
    autorId: user.id,
    tipo: parsed.data.tipo,
    conteudo: parsed.data.conteudo?.trim() || null,
  });
  await db
    .update(parceiros)
    .set({ ultimoContato: agora, updatedAt: agora })
    .where(eq(parceiros.id, id));

  return NextResponse.json({ ok: true }, { status: 201 });
}
