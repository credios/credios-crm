import { eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { regrasRoteamento } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { reorderRulesSchema } from "@/lib/validators/rule";

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

  const parsed = reorderRulesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const ids = parsed.data.ids;

  // Sanity check: todas as ids devem existir.
  const existing = await db
    .select({ id: regrasRoteamento.id })
    .from(regrasRoteamento)
    .where(inArray(regrasRoteamento.id, ids));
  if (existing.length !== ids.length) {
    return NextResponse.json({ error: "alguma regra não existe" }, { status: 400 });
  }

  // Top do array (index 0) = maior prioridade. Espaçamento de 10 pra permitir inserts.
  const updates = ids.map((id, i) => ({
    id,
    prioridade: (ids.length - i) * 10,
  }));

  await db.transaction(async (tx) => {
    for (const u of updates) {
      await tx
        .update(regrasRoteamento)
        .set({ prioridade: u.prioridade })
        .where(eq(regrasRoteamento.id, u.id));
    }
  });

  void logAction(
    null,
    user.id,
    "regras_reordenadas",
    "regra_roteamento",
    null,
    { ordem: ids },
    extractRequestMeta(request),
  );

  return NextResponse.json({ ok: true, updates });
}
