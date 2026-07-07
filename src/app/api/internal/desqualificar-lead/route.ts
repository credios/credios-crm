import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { interacoes, leads as leadsTable } from "../../../../../db/schema";
import { db } from "@/lib/db";
import { encerrarCadencia } from "@/lib/cadencia/engine";
import { onLeadStageChange } from "@/lib/google-ads/dispatcher";
import { notifyPartnerPortal } from "@/lib/notifications/portal-webhook";
import { cancelarReuniao, reuniaoAtivaDoLead } from "@/lib/sdr/agendar";
import { resolveSlaAlertsForLead } from "@/lib/sla/check";
import { enviarTextoWhatsApp } from "@/lib/whatsapp/meta";

export const dynamic = "force-dynamic";

/**
 * Endpoint INTERNO (protegido por CRON_SECRET) pra desqualificar um lead com uma
 * mensagem final de despedida pelo WhatsApp — usado quando a equipe identifica um
 * lead inválido (ex.: competidor testando). Roda no server (Vercel) que tem as
 * credenciais do Meta. Fluxo atômico: envia o texto → registra (marcado pra o bot
 * NÃO responder mais) → cancela a reunião (opcional) → status = desqualificado.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    leadId?: string;
    mensagem?: string;
    motivo?: string;
    cancelarReuniao?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { leadId, mensagem, motivo, cancelarReuniao: cancelar } = body;
  if (!leadId || !mensagem || !motivo) {
    return NextResponse.json(
      { error: "leadId, mensagem e motivo são obrigatórios" },
      { status: 400 },
    );
  }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "lead não encontrado" }, { status: 404 });
  if (!lead.whatsapp) return NextResponse.json({ error: "lead sem whatsapp" }, { status: 400 });

  // 1) Envia a mensagem final (texto livre — exige janela de 24h aberta). Se o
  //    Meta rejeitar, NÃO desqualifica (pra não marcar sem ter avisado).
  const to = lead.whatsapp.replace(/\D/g, "");
  const envio = await enviarTextoWhatsApp(to, mensagem);
  if (!envio.ok) {
    return NextResponse.json(
      { error: "falha ao enviar WhatsApp", status: envio.status },
      { status: 502 },
    );
  }

  // 2) Registra o envio marcado como aviso de desqualificação → o bot NÃO
  //    responde mais nada (jaAvisouDesqualificado passa a ser true).
  await db.insert(interacoes).values({
    leadId: lead.id,
    autorId: null,
    tipo: "whatsapp_enviado",
    conteudo: mensagem,
    metadata: {
      canal: "whatsapp_ia",
      automatico: false,
      equipe: true,
      desqualificado_aviso: true,
      wamid: envio.id ?? null,
    } as never,
  });

  // 3) Cancela a reunião ativa (se pedido).
  let reuniaoCancelada = false;
  if (cancelar) {
    const r = await reuniaoAtivaDoLead(lead.id);
    if (r) {
      await cancelarReuniao(r.reuniaoId);
      reuniaoCancelada = true;
    }
  }

  // 4) Desqualifica (limpa dados financeiros, espelhando o endpoint de status).
  const [updated] = await db
    .update(leadsTable)
    .set({
      status: "desqualificado",
      motivoDesqualificacao: motivo,
      bancoAprovador: null,
      valorLiberadoCentavos: null,
      comissaoCentavos: null,
      dataFechamento: null,
    })
    .where(eq(leadsTable.id, lead.id))
    .returning();

  await resolveSlaAlertsForLead(lead.id);
  await encerrarCadencia(lead.id).catch(() => {});
  if (updated) {
    await notifyPartnerPortal(updated, "desqualificado").catch(() => {});
    await onLeadStageChange(updated, "desqualificado").catch(() => {});
  }
  await db.insert(interacoes).values({
    leadId: lead.id,
    autorId: null,
    tipo: "mudanca_status",
    conteudo: `Status alterado de ${lead.status} para desqualificado`,
    metadata: {
      de: lead.status,
      para: "desqualificado",
      motivo,
      canal: "whatsapp_ia",
      equipe: true,
    } as never,
  });

  console.log(
    `[desqualificar] lead ${lead.id} (${lead.nome}) desqualificado; msg enviada; reunião cancelada=${reuniaoCancelada}`,
  );
  return NextResponse.json({
    ok: true,
    sent: true,
    wamid: envio.id ?? null,
    reuniaoCancelada,
  });
}
