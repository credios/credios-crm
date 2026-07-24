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
import { motivoPerdidoPadrao } from "@/lib/cadencia/tipos";
import { db } from "@/lib/db";
import { onLeadStageChange } from "@/lib/google-ads/dispatcher";
import { notifyPartnerPortal } from "@/lib/notifications/portal-webhook";
import { resolveSlaAlertsForLead } from "@/lib/sla/check";
import { aoEncerrarLead } from "@/lib/leads/encerramento";
import { cederVezAoHumano } from "@/lib/whatsapp/handoff";

type Ctx = { params: Promise<{ id: string }> };

// Ações da CADÊNCIA de follow-up (Mesa "fazer agora" + faxina). Todas de 1-2
// toques no cliente; o motor decide o próximo passo. Nunca exige texto além
// da nota do "manter +7d" (decisão consciente de exceção).

type Acao =
  | { acao: "executar_mensagem"; livre?: boolean }
  | { acao: "executar_ligacao"; resultado: "atendeu" | "nao_atendeu"; enviarMensagem?: boolean }
  | { acao: "respondeu" }
  | { acao: "adiar" }
  | { acao: "pular" }
  | { acao: "decisao_perdido"; motivo?: string; faxina?: boolean }
  | { acao: "decisao_desqualificado"; motivo: string; faxina?: boolean }
  | { acao: "decisao_manter"; nota: string }
  | { acao: "faxina_retomar" };

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
      // `livre`: o consultor abriu o WhatsApp sem a mensagem pronta (vai
      // escrever do jeito dele). Conta como a execução do passo do mesmo
      // jeito — só registra contato genérico e abre a conversa sem texto.
      const livre = body.livre === true;
      const mensagem = livre ? null : await prepararMensagemPasso(lead, passo, user.nome);
      if (!livre && !mensagem) {
        return NextResponse.json({ error: "template do passo indisponível" }, { status: 500 });
      }
      // Registro COMPACTO na timeline (feedback do consultor: a transcrição
      // inteira poluía a ficha). O texto completo fica no metadata pra
      // auditoria; a timeline mostra só o essencial.
      await db.insert(interacoes).values({
        leadId: id,
        autorId: user.id,
        tipo: "whatsapp_enviado",
        conteudo: livre
          ? `Contato por WhatsApp (mensagem livre, fora do padrão) — "${passo.titulo}".`
          : `Mensagem da cadência enviada pelo WhatsApp — "${passo.titulo}".`,
        metadata: {
          cadencia: true,
          cadencia_passo: lead.cadenciaPasso,
          passo_titulo: passo.titulo,
          ...(livre ? { livre: true } : { mensagem }),
        } as never,
      });
      await db.update(leadsTable).set({ ultimoContato: agora }).where(eq(leadsTable.id, id));
      await resolveSlaAlertsForLead(id);
      await cederVezAoHumano(id, "contato_manual");
      await avancarPasso(lead, "executou");
      const digits = (lead.whatsapp ?? "").replace(/\D/g, "");
      const waUrl = digits
        ? mensagem
          ? `https://wa.me/${digits}?text=${encodeURIComponent(mensagem)}`
          : `https://wa.me/${digits}`
        : null;
      return NextResponse.json({ ok: true, waUrl, mensagem });
    }

    // ── Executar passo de LIGAÇÃO (opcionalmente com mensagem de backup) ──
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
      // "Não atendeu" com template anexo → prepara a mensagem de backup no
      // mesmo toque (ligação + mensagem, pedido do owner) e devolve o wa.me.
      let waUrlLigacao: string | null = null;
      if (body.enviarMensagem && passo.templateId) {
        const msg = await prepararMensagemPasso(lead, passo, user.nome);
        if (msg) {
          await db.insert(interacoes).values({
            leadId: id,
            autorId: user.id,
            tipo: "whatsapp_enviado",
            conteudo: `Mensagem da cadência enviada pelo WhatsApp — "${passo.titulo}" (após ligação sem resposta).`,
            metadata: { cadencia: true, cadencia_passo: lead.cadenciaPasso, mensagem: msg } as never,
          });
          const dig = (lead.whatsapp ?? "").replace(/\D/g, "");
          waUrlLigacao = dig ? `https://wa.me/${dig}?text=${encodeURIComponent(msg)}` : null;
        }
      }
      await db.update(leadsTable).set({ ultimoContato: agora }).where(eq(leadsTable.id, id));
      await resolveSlaAlertsForLead(id);
      await cederVezAoHumano(id, "contato_manual");
      await avancarPasso(lead, "executou");
      return NextResponse.json({ ok: true, waUrl: waUrlLigacao });
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
      // 'fechado' é terminal protegido: sair dele (apagando banco/valor/
      // comissão) é admin-only — mesmo guard da rota canônica de status.
      if (lead.status === "fechado" && !checkPermission(user, "lead.close_or_reopen")) {
        return NextResponse.json(
          { error: "Somente admin pode reabrir/alterar um lead fechado." },
          { status: 403 },
        );
      }
      const novoStatus = body.acao === "decisao_perdido" ? "perdido" : "desqualificado";
      const motivo =
        (("motivo" in body && body.motivo) || "").trim() ||
        (novoStatus === "perdido" ? motivoPerdidoPadrao(lead.status) : "Outro");
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
      // Decisão manual do consultor → o bot cede a vez (lead perdido não pode
      // continuar sendo atendido pela Heloísa se o cliente escrever).
      await cederVezAoHumano(id, "status_manual").catch(() => {});
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
        // Cancela reuniões futuras; desqualificado também avisa o cliente
        // (Heloísa se janela aberta + e-mail educado).
        after(() => aoEncerrarLead(updated, novoStatus as "perdido" | "desqualificado"));
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
