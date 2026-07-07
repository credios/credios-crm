import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { interacoes, leads as leadsTable, reunioes } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { aoMudarStatusCadencia } from "@/lib/cadencia/engine";
import { desfechoReuniaoMoveLead } from "@/lib/cadencia/tipos";
import { db } from "@/lib/db";
import { onLeadStageChange } from "@/lib/google-ads/dispatcher";
import { notifyPartnerPortal } from "@/lib/notifications/portal-webhook";

type Ctx = { params: Promise<{ id: string }> };

// Desfecho OBRIGATÓRIO de reunião (card no topo da Mesa quando a reunião passa
// sem registro). 2 toques:
//  - realizada → lead vai pra aguardando_documentacao e a cadência de docs
//    começa AGORA (passo 1 = pedir docs com link do portal) — a ponte entre os
//    dois pontos de inflexão do funil.
//  - no_show → lead volta pra conversa_inicial e a cadência de resgate começa
//    AGORA (passo 1 = convite de reunião com link da agenda = reagendamento).
// Exceção: lead que JÁ avançou além da reunião (docs, negociação…) mantém o
// status — o desfecho tardio só registra, nunca regride o funil.

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [reuniao] = await db.select().from(reunioes).where(eq(reunioes.id, id)).limit(1);
  if (!reuniao) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, reuniao.leadId))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead.change_status", {
      type: "lead",
      consultorId: lead.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { resultado?: string; nota?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const resultado = body.resultado;
  if (resultado !== "realizada" && resultado !== "no_show") {
    return NextResponse.json({ error: "resultado inválido" }, { status: 400 });
  }
  const nota =
    typeof body.nota === "string" && body.nota.trim()
      ? body.nota.trim().slice(0, 500)
      : null;

  await db
    .update(reunioes)
    .set({ status: resultado, updatedAt: new Date() })
    .where(eq(reunioes.id, id));

  // Lead que já avançou além da reunião (docs, negociação…) NÃO regride:
  // registra o desfecho e pronto.
  const deveMover = desfechoReuniaoMoveLead(lead.status);

  const conteudoBase =
    resultado === "realizada"
      ? deveMover
        ? "✅ Reunião realizada — próximo passo: documentação."
        : "✅ Reunião realizada."
      : deveMover
        ? "❌ Reunião não aconteceu (no-show) — iniciando resgate."
        : "❌ Reunião não aconteceu (no-show).";
  await db.insert(interacoes).values({
    leadId: lead.id,
    autorId: user.id,
    tipo: "reuniao",
    conteudo: nota ? `${conteudoBase}\nFeedback: ${nota}` : conteudoBase,
    metadata: { reuniaoId: id, desfecho: resultado } as never,
  });

  // Move o lead pro estágio certo e liga a cadência correspondente na hora.
  const novoStatus =
    resultado === "realizada" ? "aguardando_documentacao" : "conversa_inicial";
  if (deveMover && lead.status !== novoStatus) {
    const [updated] = await db
      .update(leadsTable)
      .set({ status: novoStatus })
      .where(eq(leadsTable.id, lead.id))
      .returning();
    await db.insert(interacoes).values({
      leadId: lead.id,
      autorId: user.id,
      tipo: "mudanca_status",
      conteudo: `Status alterado de ${lead.status} para ${novoStatus}`,
      metadata: { de: lead.status, para: novoStatus, desfecho_reuniao: resultado } as never,
    });
    if (updated) {
      after(() => notifyPartnerPortal(updated, novoStatus));
      after(() => onLeadStageChange(updated, novoStatus));
    }
  }
  if (deveMover) await aoMudarStatusCadencia(lead.id, novoStatus);

  const meta = extractRequestMeta(request);
  after(() =>
    logAction(null, user.id, "reuniao_desfecho", "lead", lead.id, {
      reuniaoId: id,
      resultado,
    }, meta),
  );

  return NextResponse.json({ ok: true, novoStatus: deveMover ? novoStatus : lead.status });
}
