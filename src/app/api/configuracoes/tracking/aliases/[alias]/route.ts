// DELETE /api/configuracoes/tracking/aliases/[alias]
// Remove um alias. Admin only.

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { trackingSourceAliases } from "../../../../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ alias: string }> },
) {
  const user = await getAppUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { alias } = await context.params;
  const decoded = decodeURIComponent(alias).toLowerCase();

  const deleted = await db
    .delete(trackingSourceAliases)
    .where(eq(trackingSourceAliases.alias, decoded))
    .returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: "alias not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: deleted[0] });
}
