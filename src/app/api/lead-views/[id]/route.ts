import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { savedLeadViews } from "../../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DELETE /api/lead-views/[id] — só remove visualização do próprio usuário. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const deleted = await db
    .delete(savedLeadViews)
    .where(and(eq(savedLeadViews.id, id), eq(savedLeadViews.userId, user.id)))
    .returning({ id: savedLeadViews.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
