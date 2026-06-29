import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { sendWhatsappHealthEmail } from "@/lib/notifications/email";

export const dynamic = "force-dynamic";

/**
 * Cron (Vercel, a cada 2h — vercel.json): health-check da Heloísa.
 *
 * Detecta FALHA SILENCIOSA: mensagens de cliente sem resposta do bot (token do
 * Meta expirado / Meta fora do ar / bug) — o pior cenário, porque ninguém vigia
 * o número automático. Critério: leads cuja ÚLTIMA mensagem de WhatsApp é do
 * cliente (`whatsapp_recebido`), recebida entre 30min e 3h atrás, SEM resposta
 * depois — excluindo silêncio intencional (concluída / opt-out) e leads terminais.
 * Se achar, alerta por e-mail (WHATSAPP_ALERT_EMAIL). Auth via CRON_SECRET (Vercel Cron).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const pendentes = await db.execute<{ id: string; nome: string | null }>(sql`
    SELECT DISTINCT l.id, l.nome
    FROM public.leads l
    JOIN public.interacoes r
      ON r.lead_id = l.id AND r.tipo::text = 'whatsapp_recebido'
    WHERE r.criado_em < now() - interval '30 minutes'
      AND r.criado_em > now() - interval '3 hours'
      -- Só mensagens REAIS recebidas pelo bot (canal whatsapp_ia). Exclui
      -- lançamentos manuais de "WhatsApp" na timeline (autor = usuário, sem
      -- canal), que não passam pelo bot e geravam falso "bot não respondeu".
      AND r.metadata ->> 'canal' = 'whatsapp_ia'
      AND coalesce(l.qualif_whatsapp_status, '') NOT IN ('concluida', 'optout')
      AND l.status NOT IN ('fechado', 'perdido', 'desqualificado')
      AND NOT EXISTS (
        SELECT 1 FROM public.interacoes e
        WHERE e.lead_id = l.id
          AND e.tipo::text = 'whatsapp_enviado'
          AND e.criado_em > r.criado_em
      )
    LIMIT 20
  `);

  const lista = pendentes as unknown as { id: string; nome: string | null }[];
  if (lista.length === 0) {
    return NextResponse.json({ ok: true, pendentes: 0 });
  }

  const exemplos = lista.slice(0, 5).map((p) => p.nome ?? "(sem nome)");
  await sendWhatsappHealthEmail(lista.length, exemplos);

  console.log(`[cron health] pendentes=${lista.length} — alerta enviado por e-mail`);
  return NextResponse.json({ ok: true, pendentes: lista.length });
}
