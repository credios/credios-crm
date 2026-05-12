// POST /api/configuracoes/tracking/aliases — cria alias utm_source → source.
// Admin only.

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  trackingSourceAliases,
  trackingSources,
} from "../../../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

const postSchema = z.object({
  alias: z.string().trim().min(1).toLowerCase(),
  source: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Confirma que o source existe (FK enforça, mas dá feedback melhor).
  const [src] = await db
    .select({ source: trackingSources.source })
    .from(trackingSources)
    .where(eq(trackingSources.source, parsed.data.source))
    .limit(1);
  if (!src) {
    return NextResponse.json(
      { error: `source "${parsed.data.source}" não existe` },
      { status: 400 },
    );
  }

  const inserted = await db
    .insert(trackingSourceAliases)
    .values(parsed.data)
    .onConflictDoNothing({ target: trackingSourceAliases.alias })
    .returning();

  if (inserted.length === 0) {
    return NextResponse.json(
      { error: `alias "${parsed.data.alias}" já existe` },
      { status: 409 },
    );
  }

  return NextResponse.json({ alias: inserted[0] }, { status: 201 });
}
