import { NextResponse, type NextRequest } from "next/server";

import {
  processarLembretesConsultor,
  processarLembretesReuniao,
} from "@/lib/sdr/lembrete";

export const dynamic = "force-dynamic";

/**
 * Cron (Vercel, a cada 10 min — vercel.json): envia o lembrete de ~30 min antes
 * pro CLIENTE (WhatsApp+email, flag `lembrete_enviado`) e o de ~15 min antes pro
 * CONSULTOR (e-mail, flag `lembrete_consultor_enviado`).
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
  const c = await processarLembretesConsultor();
  console.log(
    `[cron lembrete] cliente=${r.enviados}/${r.candidatos} consultor=${c.enviados}/${c.candidatos}`,
  );
  return NextResponse.json({ ok: true, cliente: r, consultor: c });
}
