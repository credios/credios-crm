import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { interacoes } from "../../../../../db/schema";
import { db } from "@/lib/db";
import { sendSdrWatchdogEmail } from "@/lib/notifications/email";

export const dynamic = "force-dynamic";

/**
 * Cron (Vercel, a cada hora — vercel.json): watchdog do SDR. Detecta leads
 * parados há 24h+ numa fase de DECISÃO do bot (`agendando`/`remarcando`) — a
 * Heloísa ofertou horários e a conversa morreu. Foi o padrão dos leads presos
 * achados na auditoria de 2026-07-06 (teria pego a Daiane no dia seguinte).
 *
 * Ação: marca a timeline do lead (dedup — 1 alerta por lead até a conversa se
 * mover de novo) e manda UM e-mail-resumo pro time. Não mexe no estado do bot:
 * o cliente ainda pode voltar e agendar; o alerta é pro humano dar o empurrão.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Leads em fase de decisão cuja ÚLTIMA mensagem (enviada ou recebida) tem
  // 24h+, sem marcador de watchdog mais novo que essa mensagem (dedup que
  // re-arma sozinho se a conversa voltar e travar de novo).
  const rows = (await db.execute(sql`
    SELECT l.id, l.nome, l.qualif_whatsapp_status AS fase,
           EXTRACT(EPOCH FROM (now() - ult.ultima)) / 3600 AS horas
    FROM public.leads l
    JOIN LATERAL (
      SELECT max(i.criado_em) AS ultima
      FROM public.interacoes i
      WHERE i.lead_id = l.id
        AND i.tipo IN ('whatsapp_enviado', 'whatsapp_recebido')
    ) ult ON true
    WHERE l.qualif_whatsapp_status IN ('agendando', 'remarcando')
      AND ult.ultima < now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.interacoes w
        WHERE w.lead_id = l.id
          AND w.tipo = 'evento_sistema'
          AND w.metadata ->> 'watchdog' IS NOT NULL
          AND w.criado_em > ult.ultima
      )
    LIMIT 20
  `)) as unknown as { id: string; nome: string | null; fase: string; horas: number }[];

  const itens = [...rows].map((r) => ({
    id: r.id,
    nome: r.nome ?? "(sem nome)",
    fase: r.fase,
    horas: Math.round(Number(r.horas)),
  }));

  for (const item of itens) {
    await db.insert(interacoes).values({
      leadId: item.id,
      autorId: null,
      tipo: "evento_sistema",
      conteudo: `⏳ Watchdog: conversa parada há ~${item.horas}h na fase "${item.fase}" — vale um contato humano.`,
      metadata: { canal: "whatsapp_ia", automatico: true, watchdog: item.fase } as never,
    });
  }

  let emailOk = false;
  if (itens.length > 0) {
    const r = await sendSdrWatchdogEmail(itens);
    emailOk = r.ok;
  }

  console.log(`[cron sdr-watchdog] presos=${itens.length} email=${emailOk}`);
  return NextResponse.json({ ok: true, presos: itens.length, emailOk });
}
