import { and, gt, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { leads } from "../../../../../db/schema";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { sendProativoFailureEmail } from "@/lib/notifications/email";
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
        // Viu a agenda pública? Espera 15 min DA OFERTA (não da criação) — dá
        // tempo de o cliente marcar sozinho antes de a Heloísa abordar.
        or(
          isNull(leads.agendaOferecidaEm),
          lt(leads.agendaOferecidaEm, new Date(agora - MIN_MS)),
        ),
        notInArray(leads.status, [...SYSTEM_TERMINAL_KEYS]),
      ),
    )
    .limit(LOTE);

  let enviados = 0;
  let ultimoErro: string | undefined;
  for (const lead of candidatos) {
    const r = await enviarProativoWhatsapp({
      leadId: lead.id,
      nome: lead.nome,
      whatsapp: lead.whatsapp,
    });
    if (r.sent) enviados++;
    else if (r.error) ultimoErro = r.error;
  }

  // Alerta de falha proativa: havia candidatos, TODOS falharam por erro de envio
  // (token expirado / app despublicado / conta do Meta). Sem isso ninguém
  // percebe — um proativo que não sai não gera resposta de cliente para o
  // health-check reativo detectar. Esse foi o gap da queda de 2026-06-25.
  if (candidatos.length > 0 && enviados === 0 && ultimoErro) {
    await alertarFalhaProativa(candidatos.length, ultimoErro);
  }

  console.log(`[cron proativo] candidatos=${candidatos.length} enviados=${enviados}`);
  return NextResponse.json({ ok: true, candidatos: candidatos.length, enviados });
}

/**
 * Envia no máx. 1 e-mail a cada 2h (dedup via audit_log) para não spammar
 * durante uma queda prolongada. Nunca lança — falha de alerta não pode
 * derrubar o cron.
 */
async function alertarFalhaProativa(candidatos: number, erro: string): Promise<void> {
  try {
    const recente = await db.execute(sql`
      SELECT 1 FROM public.audit_log
      WHERE acao = 'whatsapp_proativo_falha_alerta'
        AND criado_em > now() - interval '2 hours'
      LIMIT 1
    `);
    if ((recente as unknown as unknown[]).length > 0) return;

    const r = await sendProativoFailureEmail(candidatos, erro);
    await logAudit({
      acao: "whatsapp_proativo_falha_alerta",
      recursoTipo: "whatsapp",
      metadata: {
        candidatos,
        erro: erro.slice(0, 300),
        emailOk: r.ok,
        emailReason: r.reason ?? null,
      },
    });
    console.log(
      `[cron proativo] ALERTA de falha proativa (candidatos=${candidatos}, email_ok=${r.ok})`,
    );
  } catch (e) {
    console.error("[cron proativo] falha ao alertar:", e);
  }
}
