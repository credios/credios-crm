import { NextResponse, type NextRequest } from "next/server";

import { processarLembretesReuniao } from "@/lib/sdr/lembrete";

export const dynamic = "force-dynamic";

/**
 * Cron (Vercel, a cada 10 min — vercel.json): envia o lembrete de ~30 min antes
 * de cada reunião agendada pela Heloísa. Idempotente via flag `lembrete_enviado`.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const r = await processarLembretesReuniao();
  console.log(`[cron lembrete] candidatos=${r.candidatos} enviados=${r.enviados}`);
  return NextResponse.json({ ok: true, ...r });
}
