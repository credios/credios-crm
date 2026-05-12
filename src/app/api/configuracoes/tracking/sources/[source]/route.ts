// PATCH /api/configuracoes/tracking/sources/[source]
// Atualiza ativo/displayName/ordem/etc de um source.
// Restrito a admin.

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { trackingSources } from "../../../../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

const patchSchema = z.object({
  ativo: z.boolean().optional(),
  displayName: z.string().min(1).optional(),
  ordem: z.number().int().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ source: string }> },
) {
  const user = await getAppUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { source } = await context.params;
  const decodedSource = decodeURIComponent(source);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const updated = await db
    .update(trackingSources)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(trackingSources.source, decodedSource))
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }

  return NextResponse.json({ source: updated[0] });
}
