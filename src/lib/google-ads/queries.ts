import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { googleAdsConversions, leads } from "../../../db/schema";
import { db } from "@/lib/db";

// ============================================================================
// Queries de leitura pro painel admin de conversões Google Ads.
// ============================================================================

export type GadsConversionRow = {
  id: string;
  leadId: string;
  leadNome: string | null;
  conversionAction: string; // 'qualified' | 'closed'
  status: string;
  valueCents: number | null;
  gclid: string | null;
  conversionAt: Date;
  uploadedAt: Date | null;
  attempts: number;
  error: string | null;
};

export type GadsOverview = {
  totals: {
    total: number;
    uploaded: number;
    pending: number;
    failed: number;
    retractUnsupported: number;
  };
  byAction: {
    qualifiedUploaded: number;
    closedUploaded: number;
  };
  valueUploadedCents: number;
  recent: GadsConversionRow[];
};

export async function getGoogleAdsConversionsOverview(
  limit = 100,
): Promise<GadsOverview> {
  const [counts, recent] = await Promise.all([
    db
      .select({
        status: googleAdsConversions.status,
        action: googleAdsConversions.conversionAction,
        n: sql<number>`count(*)::int`,
        value: sql<number>`coalesce(sum(${googleAdsConversions.valueCents}), 0)::bigint`,
      })
      .from(googleAdsConversions)
      .groupBy(
        googleAdsConversions.status,
        googleAdsConversions.conversionAction,
      ),
    db
      .select({
        id: googleAdsConversions.id,
        leadId: googleAdsConversions.leadId,
        leadNome: leads.nome,
        conversionAction: googleAdsConversions.conversionAction,
        status: googleAdsConversions.status,
        valueCents: googleAdsConversions.valueCents,
        gclid: googleAdsConversions.gclid,
        conversionAt: googleAdsConversions.conversionAt,
        uploadedAt: googleAdsConversions.uploadedAt,
        attempts: googleAdsConversions.attempts,
        error: googleAdsConversions.error,
      })
      .from(googleAdsConversions)
      .leftJoin(leads, eq(leads.id, googleAdsConversions.leadId))
      .orderBy(desc(googleAdsConversions.conversionAt))
      .limit(limit),
  ]);

  const totals = {
    total: 0,
    uploaded: 0,
    pending: 0,
    failed: 0,
    retractUnsupported: 0,
  };
  const byAction = { qualifiedUploaded: 0, closedUploaded: 0 };
  let valueUploadedCents = 0;

  for (const c of counts) {
    const n = Number(c.n);
    totals.total += n;
    if (c.status === "uploaded") {
      totals.uploaded += n;
      valueUploadedCents += Number(c.value);
      if (c.action === "qualified") byAction.qualifiedUploaded += n;
      if (c.action === "closed") byAction.closedUploaded += n;
    } else if (c.status === "pending") totals.pending += n;
    else if (c.status === "failed") totals.failed += n;
    else if (c.status === "retract_unsupported") totals.retractUnsupported += n;
  }

  return { totals, byAction, valueUploadedCents, recent };
}
