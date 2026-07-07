import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { interacoes, leads as leadsTable } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { cadenciaDoStatus } from "@/lib/cadencia/config";
import {
  adiarPasso,
  avancarPasso,
  encerrarCadencia,
  iniciarCadencia,
  manterMaisSete,
  reagendarPorInteracao,
} from "@/lib/cadencia/engine";
import { prepararMensagemPasso } from "@/lib/cadencia/render";
import { db } from "@/lib/db";
import { onLeadStageChange } from "@/lib/google-ads/dispatcher";
import { notifyPartnerPortal } from "@/lib/notifications/portal-webhook";
import { resolveSlaAlertsForLead } from "@/lib/sla/check";
import { cederVezAoHumano } from "@/lib/whatsapp/handoff";

type Ctx = { params: Promise<{ id: string }> };

// Ações da CADÊNCIA de follow-up (Mesa "fazer agora" + faxina). Todas de 1-2
// toques no cliente; o motor decide o próximo passo. Nunca exige texto além
// da nota do "manter +7d" (decisão consciente de exceção).

type Acao =
  | { acao: "executar_mensagem" }
  | { acao: "executar_ligacao"; resultado: "atendeu" | "nao_atendeu" }
  | { acao: "respondeu" }
  | { acao: "adiar" }
  | { acao: "pular" }
  | { acao: "decisao_perdido"; motivo?: string; faxina?: boolean }
  | { acao: "decisao_desqualificado"; motivo: string; faxina?: boolean }
  | { acao: "decisao_manter"; nota: string }
  | { acao: "faxina_retomar" };

const MOTIVO_SEM_RESPOSTA = "Sem resposta após cadência completa de follow-up";

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: Acao;
  try {
    body = (await request.json()) as Acao;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const ehDecisao =
    body.acao === "decisao_perdido" || body.acao === "decisao_desqualificado";
  const permissao = ehDecisao ? "lead.change_status" : "interacao.create";
  if (!checkPermission(user, permissao, { type: "lead", consultorId: lead.consultorId })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const agora = new Date();
  const cad = await cadenciaDoStatus(lead.status);
  const passo =
    lead.cadenciaPasso != null ? (cad?.passos[lead.cadenciaPasso] ?? null) : null;

  switch (body.acao) {
    // ── Executar passo de MENSAGEM: prepara texto, registra, avança, devolve wa.me ──
    case "executar_mensagem": {
      if (!passo || passo.tipo !== "mensagem") {
        return NextResponse.json({ error: "passo atual não é mensagem" }, { status: 409 });
      }
      const mensagem = await prepararMensagemPasso(lead, passo, user.nome);
      if (!mensagem) {
        return NextResponse.json({ error: "template do passo indisponível" }, { status: 500 });
      }
      await db.insert(interacoes).values({
        leadId: id,
        autorId: user.id,
        tipo: "whatsapp_enviado",
        conteudo: mensagem,
        metadata: { cadencia: true, cadencia_passo: lead.cadenciaPasso, passo_titulo: passo.titulo } as never,
      });
      await db.update(leadsTable).set({ ultimoContato: agora }).where(eq(leadsTable.id, id));
      await resolveSlaAlertsForLead(id);
      await cederVezAoHumano(id, "contato_manual");
      await avancarPasso(lead, "executou");
      const digits = (lead.whatsapp ?? "").replace(/\D/g, "");
      const waUrl = digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(mensagem)}`
        : null;
      return NextResponse.json({ ok: true, waUrl, mensagem });
    }

    // ── Executar passo de LIGAÇÃO ──
    case "executar_ligacao": {
      if (!passo || passo.tipo !== "ligacao") {
        return NextResponse.json({ error: "passo atual não é ligação" }, { status: 409 });
      }
      const atendeu = body.resultado === "atendeu";
      await db.insert(interacoes).values({
        leadId: id,
        autorId: user.id,
        tipo: "ligacao",
        conteudo: `Ligação da cadência — ${atendeu ? "atendeu" : "não atendeu"} (${passo.titulo})`,
        metadata: { cadencia: true, cadencia_passo: lead.cadenciaPasso, atendeu } as never,
      });
      await db.update(leadsTable).set({ ultimoContato: agora }).where(eq(leadsTable.id, id));
      await resolveSlaAlertsForLead(id);
      await cederVezAoHumano(id, "contato_manual");
      await avancarPasso(lead, "executou");
      return NextResponse.json({ ok: true });
    }

    // ── Cliente respondeu (no WhatsApp pessoal do consultor) → conversa viva ──
    case "respondeu": {
      await db.insert(interacoes).values({
        leadId: id,
        autorId: user.id,
        tipo: "whatsapp_recebido",
        conteudo: null,
        metadata: { cadencia: true, respondeu: true } as never,
      });
      await db.update(leadsTable).set({ ultimoContato: agora }).where(eq(leadsTable.id, id));
      await resolveSlaAlertsForLead(id);
      await reagendarPorInteracao(id);
      return NextResponse.json({ ok: true });
    }

    case "adiar": {
      await adiarPasso(id);
      return NextResponse.json({ ok: true });
    }

    case "pular": {
      await avancarPasso(lead, "pulou");
      return NextResponse.json({ ok: true });
    }

    // ── Decisões de fim de cadência (e faxina) ──
    case "decisao_perdido":
    case "decisao_desqualificado": {
      const novoStatus = body.acao === "decisao_perdido" ? "perdido" : "desqualificado";
      const motivo =
        (("motivo" in body && body.motivo) || "").trim() ||
        (novoStatus === "perdido" ? MOTIVO_SEM_RESPOSTA : "outro");
      const [updated] = await db
        .update(leadsTable)
        .set({
          status: novoStatus,
          motivoDesqualificacao: motivo,
          bancoAprovador: null,
          valorLiberadoCentavos: null,
          comissaoCentavos: null,
          dataFechamento: null,
        })
        .where(eq(leadsTable.id, id))
        .returning();
      await db.insert(interacoes).values({
        leadId: id,
        autorId: user.id,
        tipo: "mudanca_status",
        conteudo: `Status alterado de ${lead.status} para ${novoStatus}`,
        metadata: {
          de: lead.status,
          para: novoStatus,
          motivo,
          cadencia: !body.faxina,
          faxina: !!body.faxina,
        } as never,
      });
      await encerrarCadencia(id);
      await resolveSlaAlertsForLead(id); // lead encerrado → some dos alertas
      const meta = extractRequestMeta(request);
      after(() =>
        logAction(null, user.id, "lead_status_mudou", "lead", id, {
          de: lead.status,
          para: novoStatus,
          motivo,
          via: body.faxina ? "faxina" : "cadencia",
        }, meta),
      );
      if (updated) {
        after(() => notifyPartnerPortal(updated, novoStatus));
        after(() => onLeadStageChange(updated, novoStatus));
      }
      return NextResponse.json({ ok: true });
    }

    case "decisao_manter": {
      const nota = (body.nota ?? "").trim();
      if (!nota) {
        return NextResponse.json(
          { error: "manter exige uma nota curta (por que vale insistir?)" },
          { status: 400 },
        );
      }
      await manterMaisSete(id);
      await db.insert(interacoes).values({
        leadId: id,
        autorId: user.id,
        tipo: "anotacao",
        conteudo: `Cadência estendida +7d: ${nota}`,
        metadata: { cadencia: true, manter: true } as never,
      });
      return NextResponse.json({ ok: true });
    }

    // ── Faxina: retomar cadência (entra na fila a partir de amanhã) ──
    case "faxina_retomar": {
      const amanha = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
      const ok = await iniciarCadencia(id, lead.status, { primeiraEm: amanha });
      await db.insert(interacoes).values({
        leadId: id,
        autorId: user.id,
        tipo: "evento_sistema",
        conteudo: ok
          ? "Faxina: cadência de follow-up retomada (volta pra fila amanhã)."
          : "Faxina: lead mantido (status sem cadência configurada).",
        metadata: { faxina: true, retomar: true } as never,
      });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "ação inválida" }, { status: 400 });
  }
}
