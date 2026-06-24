import { and, gt, isNotNull, isNull, lt, notInArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { leads } from "../../../../../db/schema";
import { db } from "@/lib/db";
import { SYSTEM_TERMINAL_KEYS } from "@/lib/status/canonical";
import { enviarProativoWhatsapp } from "@/lib/whatsapp/proativo";

export const dynamic = "force-dynamic";

// Janela de elegibilidade do proativo: já passou MIN do cadastro inicial, mas
// dentro de MAX (não varre leads antigos num primeiro run / após queda do cron).
const MIN_MS = 15 * 60 * 1000; // 15 min após a 1ª etapa do simulador
const MAX_MS = 2 * 60 * 60 * 1000; // teto: 2h
const LOTE = 50; // máx. por execução (drena em runs seguintes via claim)

/**
 * Cron (Vercel, a cada 5 min — vercel.json): fallback do proativo da Heloísa.
 *
 * Alcança quem deu o WhatsApp na 1ª etapa do simulador mas NÃO concluiu em 15 min
 * — "completo OU 15 min, o que vier antes". Quem conclui antes já recebeu pelo
 * gatilho imediato do webhook de lead. Idempotente via claim atômico em
 * enviarProativoWhatsapp; a janela [agora-2h, agora-15min] + `valorCredito` (só
 * leads que simularam) evitam varrer histórico e leads de outros canais.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const agora = Date.now();
  const candidatos = await db
    .select({ id: leads.id, nome: leads.nome, whatsapp: leads.whatsapp })
    .from(leads)
    .where(
      and(
        isNull(leads.qualifWhatsappStatus), // ainda não recebeu/abriu
        isNotNull(leads.whatsapp),
        isNotNull(leads.valorCreditoCentavos), // simulou (1ª etapa capturou valor)
        lt(leads.createdAt, new Date(agora - MIN_MS)),
        gt(leads.createdAt, new Date(agora - MAX_MS)),
        notInArray(leads.status, [...SYSTEM_TERMINAL_KEYS]),
      ),
    )
    .limit(LOTE);

  let enviados = 0;
  for (const lead of candidatos) {
    const ok = await enviarProativoWhatsapp({
      leadId: lead.id,
      nome: lead.nome,
      whatsapp: lead.whatsapp,
    });
    if (ok) enviados++;
  }

  console.log(`[cron proativo] candidatos=${candidatos.length} enviados=${enviados}`);
  return NextResponse.json({ ok: true, candidatos: candidatos.length, enviados });
}
