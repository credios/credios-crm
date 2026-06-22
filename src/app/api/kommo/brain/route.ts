import crypto from "node:crypto";

import { desc, sql } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { interacoes, leads } from "../../../../../db/schema";
import { db } from "@/lib/db";
import { generatePortalToken, portalUrl } from "@/lib/portal/token";

/**
 * "Cérebro" do atendimento WhatsApp (Objetivo 3 — Fase A, determinística).
 *
 * O Salesbot do Kommo chama este endpoint via `widget_request` a cada mensagem.
 * Contrato esperado no POST: { token (JWT assinado com o client_secret),
 * data: { phone, message }, return_url }. Respondemos 200 em <2s (ack) e, via
 * after(), identificamos o lead pelo telefone no nosso CRM, montamos a resposta
 * personalizada (confirma dados + link do portal + tranquiliza) e devolvemos no
 * return_url. Tudo é logado pra calibrar o payload real no 1º teste.
 *
 * Fase B (IA livre) liga o Claude aqui, com guardrails. Fase A é roteiro fixo.
 */

const HORARIO = "seg–sex, 8h–17h";

function brl(centavos: number | null | undefined): string | null {
  if (centavos == null) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    centavos / 100,
  );
}

/** Valida o JWT do widget_request: aud == client_id, não expirado, e assinatura
 *  HS256 com o client_secret (se for esse o alg). Loga o motivo em falha. */
function verifyKommoToken(token: string): {
  ok: boolean;
  reason?: string;
  claims?: Record<string, unknown>;
} {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "formato" };
  const [h, p, s] = parts;
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString());
    claims = JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return { ok: false, reason: "decode" };
  }
  const clientId = process.env.KOMMO_CLIENT_ID;
  if (clientId && claims.aud && claims.aud !== clientId)
    return { ok: false, reason: "aud", claims };
  if (typeof claims.exp === "number" && Date.now() / 1000 > claims.exp)
    return { ok: false, reason: "exp", claims };
  if (header.alg === "HS256") {
    const secret = process.env.KOMMO_CLIENT_SECRET ?? "";
    const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
    if (expected !== s) return { ok: false, reason: "assinatura", claims };
  }
  return { ok: true, claims };
}

function pick(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Acha o lead pelo telefone (casa pelos últimos 8 dígitos, lead mais recente). */
async function acharLead(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const last8 = digits.slice(-8);
  if (last8.length < 8) return null;
  const [lead] = await db
    .select()
    .from(leads)
    .where(sql`regexp_replace(${leads.whatsapp}, '\\D', '', 'g') LIKE ${"%" + last8}`)
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return lead ?? null;
}

function montarResposta(
  lead: Awaited<ReturnType<typeof acharLead>>,
  link: string | null,
): string {
  const nome = lead?.nome ? lead.nome.split(/\s+/)[0] : "";
  const valor = brl(lead?.valorCreditoCentavos);
  const cidade = lead?.cidade;
  const saudacao = `Oi${nome ? `, ${nome}` : ""}! 👋 Aqui é o assistente virtual da Credios.`;
  const confirma = lead
    ? `Confirmando rapidinho: você fez uma simulação de crédito com garantia de imóvel${
        cidade ? ` em ${cidade}` : ""
      }${valor ? `, buscando ${valor}` : ""}, certo?`
    : `Recebemos o seu contato sobre crédito com garantia de imóvel.`;
  const tranquiliza = `A sua proposta já está sendo trabalhada, e um consultor vai te chamar no horário comercial (${HORARIO}). 🙂`;
  const docs = link
    ? `Para adiantar, você já pode enviar os seus documentos com segurança por aqui:\n${link}`
    : "";
  const rodape = `É tudo gratuito e sem compromisso.`;
  return [saudacao, confirma, tranquiliza, docs, rodape].filter(Boolean).join("\n\n");
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Log do payload bruto pra calibrar o contrato real do widget_request.
  console.log("[kommo/brain] payload:", JSON.stringify(body).slice(0, 2000));

  const token = typeof body.token === "string" ? body.token : "";
  const v = verifyKommoToken(token);
  if (!v.ok) {
    console.warn("[kommo/brain] JWT inválido:", v.reason);
    return NextResponse.json({ error: "unauthorized", reason: v.reason }, { status: 401 });
  }

  const returnUrl = pick(body, ["return_url", "returnUrl"]);
  const phone = pick(body.data, ["phone", "telefone", "contact_phone", "from"]);
  const mensagem = pick(body.data, ["message", "message_text", "text"]);

  if (!returnUrl) {
    console.warn("[kommo/brain] return_url ausente — payload:", JSON.stringify(body).slice(0, 500));
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Ack rápido (<2s). O trabalho pesado vai no after().
  after(async () => {
    try {
      const lead = phone ? await acharLead(phone) : null;

      let link: string | null = null;
      if (lead?.email || lead?.id) {
        try {
          const { token: t } = await generatePortalToken(lead.id);
          link = portalUrl(t);
        } catch (e) {
          console.error("[kommo/brain] token portal falhou:", e);
        }
      }

      const resposta = montarResposta(lead, link);

      // Registra na timeline do lead (entrada + saída).
      if (lead) {
        if (mensagem) {
          await db.insert(interacoes).values({
            leadId: lead.id,
            autorId: null,
            tipo: "whatsapp_recebido",
            conteudo: mensagem,
            metadata: { canal: "kommo_bot" } as never,
          });
        }
        await db.insert(interacoes).values({
          leadId: lead.id,
          autorId: null,
          tipo: "whatsapp_enviado",
          conteudo: resposta,
          metadata: { canal: "kommo_bot", automatico: true } as never,
        });
      }

      // Devolve a resposta pro Salesbot injetar no WhatsApp.
      await fetch(returnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: { handled: true },
          execute_handlers: [
            { handler: "show", params: { type: "text", value: resposta } },
          ],
        }),
      }).catch((e) => console.error("[kommo/brain] return_url falhou:", e));
    } catch (err) {
      console.error("[kommo/brain] erro no processamento:", err);
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
