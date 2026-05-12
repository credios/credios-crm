import { desc, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import {
  leads as leadsTable,
  trackingSourceAliases,
  trackingSources,
  trackingUnknowns,
} from "../../../../../db/schema";
import { TrackingPageClient } from "@/components/configuracoes/tracking-page-client";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export default async function TrackingConfigPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/sem-permissao");

  // Sources com contagem de leads — admin vê o quão crítico cada source é.
  const sources = await db
    .select({
      source: trackingSources.source,
      channel: trackingSources.channel,
      paid: trackingSources.paid,
      displayName: trackingSources.displayName,
      color: trackingSources.color,
      icon: trackingSources.icon,
      ordem: trackingSources.ordem,
      ativo: trackingSources.ativo,
      leadCount: sql<number>`(
        SELECT count(*)::int FROM leads
        WHERE leads.source = ${trackingSources.source}
      )`,
    })
    .from(trackingSources)
    .orderBy(trackingSources.ordem);

  // Quarantine: unknowns pendentes de revisão (resolved_at IS NULL).
  const unknowns = await db
    .select({
      id: trackingUnknowns.id,
      leadId: trackingUnknowns.leadId,
      leadNome: leadsTable.nome,
      rawOrigem: trackingUnknowns.rawOrigem,
      rawReferrer: trackingUnknowns.rawReferrer,
      rawUtmSource: trackingUnknowns.rawUtmSource,
      rawUtmMedium: trackingUnknowns.rawUtmMedium,
      rawUtmCampaign: trackingUnknowns.rawUtmCampaign,
      rawClickIds: trackingUnknowns.rawClickIds,
      createdAt: trackingUnknowns.createdAt,
    })
    .from(trackingUnknowns)
    .leftJoin(leadsTable, eq(leadsTable.id, trackingUnknowns.leadId))
    .where(isNull(trackingUnknowns.resolvedAt))
    .orderBy(desc(trackingUnknowns.createdAt))
    .limit(100);

  // Aliases — mapping utm_source bruto → source canônico.
  const aliases = await db
    .select({
      alias: trackingSourceAliases.alias,
      source: trackingSourceAliases.source,
    })
    .from(trackingSourceAliases)
    .orderBy(trackingSourceAliases.source, trackingSourceAliases.alias);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
          Tracking de origem
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Catálogo de fontes (channel × source), aliases de utm_source e revisão
          de leads com origem não identificada.
        </p>
      </div>

      <TrackingPageClient
        sources={sources}
        unknowns={unknowns.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          rawClickIds: u.rawClickIds as Record<string, string | null> | null,
        }))}
        aliases={aliases}
      />
    </div>
  );
}
