import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  interacoes,
  leadBancos,
  leads as leadsTable,
} from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { onLeadStageChange } from "@/lib/google-ads/dispatcher";
import { ensureBancoInteracao, hasLeadBanks, isLeadBankStage } from "@/lib/leads/bancos";
import { notifyPartnerPortal } from "@/lib/notifications/portal-webhook";
import { updateStatusSchema } from "@/lib/validators/lead";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead.change_status", {
      type: "lead",
      consultorId: existing.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = updateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (isLeadBankStage(data.status)) {
    const bancos = "bancos" in data ? data.bancos ?? [] : [];
    const alreadyHasBanks = await hasLeadBanks(id);
    if (!alreadyHasBanks && bancos.length === 0) {
      return NextResponse.json(
        {
          error:
            "Informe ao menos um banco para mover o lead para documentação enviada ou negociação.",
        },
        { status: 400 },
      );
    }
  }

  // Transições que tocam o status 'fechado' (entrar OU sair) exigem admin —
  // só admin conhece os valores de comissão recebidos por banco.
  const tocaFechado =
    existing.status === "fechado" || data.status === "fechado";
  if (tocaFechado && !checkPermission(user, "lead.close_or_reopen")) {
    return NextResponse.json(
      {
        error:
          "Apenas administradores podem fechar leads ou reabrir leads fechados.",
      },
      { status: 403 },
    );
  }

  const updates: Record<string, unknown> = { status: data.status };
  let extraMeta: Record<string, unknown> = {};
  if (data.status === "fechado") {
    updates.bancoAprovador = data.bancoAprovador;
    updates.valorLiberadoCentavos = data.valorLiberadoCentavos;
    updates.comissaoCentavos = data.comissaoCentavos;
    updates.dataFechamento = data.dataFechamento;
    updates.motivoDesqualificacao = null;
    extraMeta = {
      banco: data.bancoAprovador,
      valor_liberado_centavos: data.valorLiberadoCentavos,
      comissao_centavos: data.comissaoCentavos,
      data_fechamento: data.dataFechamento,
    };
  } else if (data.status === "desqualificado" || data.status === "perdido") {
    updates.motivoDesqualificacao = data.motivoDesqualificacao;
    // Limpa dados financeiros caso vinha de fechado.
    updates.bancoAprovador = null;
    updates.valorLiberadoCentavos = null;
    updates.comissaoCentavos = null;
    updates.dataFechamento = null;
    extraMeta = { motivo: data.motivoDesqualificacao };
  } else {
    updates.motivoDesqualificacao = null;
    updates.bancoAprovador = null;
    updates.valorLiberadoCentavos = null;
    updates.comissaoCentavos = null;
    updates.dataFechamento = null;
  }

  const [updated] = await db
    .update(leadsTable)
    .set(updates)
    .where(eq(leadsTable.id, id))
    .returning();

  await db.insert(interacoes).values({
    leadId: id,
    autorId: user.id,
    tipo: "mudanca_status",
    conteudo: `Status alterado de ${existing.status} para ${data.status}`,
    metadata: { de: existing.status, para: data.status, ...extraMeta } as never,
  });

  if (isLeadBankStage(data.status) && "bancos" in data && data.bancos?.length) {
    for (const banco of data.bancos) {
      await db
        .insert(leadBancos)
        .values({
          leadId: id,
          banco,
          status: data.status === "documentacao_enviada" ? "enviado" : "em_analise",
          criadoPor: user.id,
        })
        .onConflictDoNothing();
      await ensureBancoInteracao({
        leadId: id,
        userId: user.id,
        banco,
        status: data.status === "documentacao_enviada" ? "enviado" : "em_analise",
      });
    }
  }

  // Reusa `tocaFechado` definido acima na validação de permissão.
  // Mudanças que tocam 'fechado' são CRÍTICAS (auditoria de receita) → await.
  // Outras transições vão pra after() — não bloqueia resposta.
  const auditCall = () =>
    logAction(
      null,
      user.id,
      "lead_status_mudou",
      "lead",
      id,
      { de: existing.status, para: data.status, ...extraMeta },
      extractRequestMeta(request),
    );
  if (tocaFechado) {
    await auditCall();
  } else {
    after(() => auditCall());
  }

  // Notifica o Portal de Parceiros (no-op para leads que não vieram dele).
  if (updated) {
    after(() => notifyPartnerPortal(updated, data.status));
    // Conversões offline p/ Google Ads (no-op se não configurado / lead não-Ads).
    after(() => onLeadStageChange(updated, data.status));
  }

  return NextResponse.json({ data: updated });
}
