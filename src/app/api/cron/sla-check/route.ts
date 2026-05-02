import { after, NextResponse, type NextRequest } from "next/server";

import { logAction } from "@/lib/audit";
import { checkSlaPrimeiroContato } from "@/lib/sla/check";
import { sendSlaAlertEmail } from "@/lib/sla/notify";

export const dynamic = "force-dynamic";

/**
 * Cron handler chamado pelo Vercel Cron a cada 5min (vercel.json).
 * Em prod, valida `Authorization: Bearer ${CRON_SECRET}` injetado pelo Vercel.
 * Em dev (NODE_ENV != production) aceita sem auth pra facilitar curl.
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

  const result = await checkSlaPrimeiroContato();

  if (result.newAlerts.length > 0) {
    after(() => sendSlaAlertEmail(result.newAlerts));
    after(() =>
      logAction(
        null,
        null,
        "sla_alertas_disparados",
        "sla_alertas",
        null,
        {
          count: result.newAlerts.length,
          evaluatedAt: result.evaluatedAt.toISOString(),
          leadIds: result.newAlerts.map((a) => a.leadId),
        },
      ),
    );
  }

  return NextResponse.json({
    ok: true,
    evaluatedAt: result.evaluatedAt.toISOString(),
    inBusinessHours: result.inBusinessHours,
    candidates: result.candidates,
    newAlerts: result.newAlerts.length,
    alerts: result.newAlerts.map((a) => ({
      alertaId: a.alertaId,
      leadId: a.leadId,
      leadNome: a.leadNome,
    })),
  });
}
