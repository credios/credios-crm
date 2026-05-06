import { eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { after, NextResponse, type NextRequest } from "next/server";

import { statusLeadConfig } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { reorderStatusSchema } from "@/lib/validators/status";

/**
 * PATCH — reordenação em massa do funil. Recebe `{ ordem: [{key, ordem}] }`
 * e atualiza tudo em uma transação. Usado pelo drag-and-drop da UI.
 */
export async function PATCH(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = reorderStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  await db.transaction(async (tx) => {
    for (const { key, ordem } of parsed.data.ordem) {
      await tx
        .update(statusLeadConfig)
        .set({ ordem, updatedAt: sql`now()` })
        .where(eq(statusLeadConfig.key, key));
    }
  });

  // `revalidateTag` em Next 16 exige `profile` no 2º arg — `"max"` força
  // expiração imediata. (Antes era `updateTag`, que só funciona em Server
  // Actions e crashava 500 em Route Handler — bug E872.)
  revalidateTag("status:config", "max");
  after(() =>
    logAction(
      null,
      user.id,
      "status_reordenado",
      "status_lead_config",
      null,
      { count: parsed.data.ordem.length },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ ok: true });
}
