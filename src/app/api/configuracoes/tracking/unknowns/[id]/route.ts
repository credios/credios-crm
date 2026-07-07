// PATCH /api/configuracoes/tracking/unknowns/[id]
// Resolve um item de quarantine, atribuindo source canônico e (opcionalmente)
// criando alias automático pra utm_source raw.
//
// Side effects ao resolver:
//   1. Marca trackingUnknowns como resolvido
//   2. Atualiza o lead (se houver) com channel/source canônicos
//   3. Cria alias se utm_source raw existe e não havia alias antes
//   4. Reclassifica leads históricos com mesmo utm_source raw (best-effort)

import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  leads,
  trackingSourceAliases,
  trackingSources,
  trackingUnknowns,
} from "../../../../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

const patchSchema = z.object({
  resolvedToSource: z.string().trim().min(1),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

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

  // Carrega quarantine row pra pegar raw utm_source
  const [unknown] = await db
    .select()
    .from(trackingUnknowns)
    .where(eq(trackingUnknowns.id, id))
    .limit(1);

  if (!unknown) {
    return NextResponse.json({ error: "unknown not found" }, { status: 404 });
  }
  if (unknown.resolvedAt) {
    return NextResponse.json({ error: "já resolvido" }, { status: 409 });
  }

  // Carrega source canônico pra pegar channel/paid
  const [src] = await db
    .select({
      source: trackingSources.source,
      channel: trackingSources.channel,
      paid: trackingSources.paid,
    })
    .from(trackingSources)
    .where(eq(trackingSources.source, parsed.data.resolvedToSource))
    .limit(1);

  if (!src) {
    return NextResponse.json(
      { error: `source "${parsed.data.resolvedToSource}" não existe` },
      { status: 400 },
    );
  }

  // 1. Marca como resolvido
  await db
    .update(trackingUnknowns)
    .set({
      resolvedToSource: src.source,
      resolvedBy: user.id,
      resolvedAt: new Date(),
    })
    .where(eq(trackingUnknowns.id, id));

  // 2. Atualiza o lead específico desse unknown
  if (unknown.leadId) {
    await db
      .update(leads)
      .set({
        channel: src.channel,
        source: src.source,
        paid: src.paid,
        origem: src.source,
      })
      .where(eq(leads.id, unknown.leadId));
  }

  // 3. Cria alias automático se utm_source raw existe
  let aliasCreated = false;
  let leadsReclassified = 0;
  if (unknown.rawUtmSource) {
    const aliasKey = unknown.rawUtmSource.trim().toLowerCase();
    const inserted = await db
      .insert(trackingSourceAliases)
      .values({ alias: aliasKey, source: src.source })
      .onConflictDoNothing({ target: trackingSourceAliases.alias })
      .returning();
    aliasCreated = inserted.length > 0;

    // 4. Reclassifica leads históricos com mesmo utm_source raw
    // (best-effort: só leads ainda marcados como Unknown ou Direct).
    const reclass = await db
      .update(leads)
      .set({
        channel: src.channel,
        source: src.source,
        paid: src.paid,
        origem: src.source,
      })
      .where(
        and(
          eq(sql`LOWER(${leads.utmSource})`, aliasKey),
          sql`(${leads.source} IS NULL OR ${leads.source} IN ('Unknown', 'Direct'))`,
        ),
      )
      .returning({ id: leads.id });
    leadsReclassified = reclass.length;

    // Marca outros unknowns com mesmo utm_source raw como resolvidos
    await db
      .update(trackingUnknowns)
      .set({
        resolvedToSource: src.source,
        resolvedBy: user.id,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(sql`LOWER(${trackingUnknowns.rawUtmSource})`, aliasKey),
          isNull(trackingUnknowns.resolvedAt),
        ),
      );
  }

  return NextResponse.json({
    resolved: true,
    source: src.source,
    aliasCreated,
    leadsReclassified,
  });
}
