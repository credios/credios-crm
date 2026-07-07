import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { duplicidadesPendentes } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** POST { resolucao: "manter_separado" | "descartar" } — resolve a duplicidade
 *  de CPF apontada pelo webhook. (Merge de leads continua manual, no detalhe.) */
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminOrGerente(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: { resolucao?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const resolucao = body.resolucao;
  if (resolucao !== "manter_separado" && resolucao !== "descartar") {
    return NextResponse.json({ error: "resolucao inválida" }, { status: 400 });
  }

  const [dup] = await db
    .select()
    .from(duplicidadesPendentes)
    .where(eq(duplicidadesPendentes.id, id))
    .limit(1);
  if (!dup) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (dup.resolvidoEm) {
    return NextResponse.json({ error: "já resolvida" }, { status: 409 });
  }

  await db
    .update(duplicidadesPendentes)
    .set({ resolvidoEm: new Date(), resolvidoPor: user.id, resolucao })
    .where(eq(duplicidadesPendentes.id, id));

  const meta = extractRequestMeta(request);
  after(() =>
    logAction(null, user.id, "duplicidade_resolvida", "lead", dup.novoLeadId, {
      duplicidadeId: id,
      resolucao,
    }, meta),
  );

  return NextResponse.json({ ok: true });
}
