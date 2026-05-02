import { eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { mensagensTemplate } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { reorderTemplatesSchema } from "@/lib/validators/template";

export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = reorderTemplatesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const ids = parsed.data.ids;

  const existing = await db
    .select({ id: mensagensTemplate.id })
    .from(mensagensTemplate)
    .where(inArray(mensagensTemplate.id, ids));
  if (existing.length !== ids.length) {
    return NextResponse.json({ error: "algum template não existe" }, { status: 400 });
  }

  // Top do array (index 0) = ordem 1. Sequencial pra não confundir.
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(mensagensTemplate)
        .set({ ordem: i + 1 })
        .where(eq(mensagensTemplate.id, ids[i]));
    }
  });

  void logAction(
    null,
    user.id,
    "templates_reordenados",
    "mensagem_template",
    null,
    { ordem: ids },
    extractRequestMeta(request),
  );

  return NextResponse.json({ ok: true });
}
