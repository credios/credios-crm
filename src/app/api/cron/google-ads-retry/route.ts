import { NextResponse, type NextRequest } from "next/server";

import { reprocessGoogleAdsConversions } from "@/lib/google-ads/dispatcher";

export const dynamic = "force-dynamic";

/**
 * Cron handler (Vercel Cron, ver vercel.json). Reprocessa conversões offline
 * do Google Ads que ficaram `pending`/`failed` (upload) ou `retract_failed`
 * (retração) — ex.: falha de rede no momento da mudança de status.
 *
 * Em prod, valida `Authorization: Bearer ${CRON_SECRET}`. Em dev aceita sem auth.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await reprocessGoogleAdsConversions();
  return NextResponse.json({ ok: true, ...result });
}
