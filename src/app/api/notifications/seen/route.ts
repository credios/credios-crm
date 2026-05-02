import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { users as usersTable } from "../../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST — marca todas notificações como lidas pro usuário atual.
 * Atualiza `users.notifications_seen_at` pra NOW(). O sino do header
 * filtra leads com created_at > seen_at pra contar não-lidos.
 *
 * Idempotente: chamar 2x em sequência só atualiza o timestamp pra
 * o segundo NOW(). Sem efeito colateral.
 */
export async function POST() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  await db
    .update(usersTable)
    .set({ notificationsSeenAt: now })
    .where(eq(usersTable.id, user.id));

  return NextResponse.json({ ok: true, seenAt: now.toISOString() });
}
