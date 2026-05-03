import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { mensagensTemplate } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { upsertTemplateSchema } from "@/lib/validators/template";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(mensagensTemplate)
    .where(eq(mensagensTemplate.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = upsertTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const [updated] = await db
    .update(mensagensTemplate)
    .set({
      nome: data.nome,
      statusAplicavel: data.statusAplicavel,
      conteudo: data.conteudo,
      ativa: data.ativa,
    })
    .where(eq(mensagensTemplate.id, id))
    .returning();

  after(() =>
    logAction(
    null,
    user.id,
    "template_editado",
    "mensagem_template",
    id,
    { nome: data.nome },
    extractRequestMeta(request),
  )
  );

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(mensagensTemplate)
    .where(eq(mensagensTemplate.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.delete(mensagensTemplate).where(eq(mensagensTemplate.id, id));

  after(() =>
    logAction(
    null,
    user.id,
    "template_excluido",
    "mensagem_template",
    id,
    { nome: existing.nome },
    extractRequestMeta(request),
  )
  );

  return NextResponse.json({ ok: true });
}
