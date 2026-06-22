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
  // exp/nbf vêm como float (segundos); tolera 60s de skew.
  if (typeof claims.exp === "number" && Date.now() / 1000 > claims.exp + 60)
    return { ok: false, reason: "exp", claims };

  // No widget_request o `aud` é a URL do widget (nosso endpoint). Quem identifica
  // a integração é `client_uuid` (== nosso KOMMO_CLIENT_ID). (Antes comparávamos
  // aud == client_id — errado, dava 401.)
  const clientId = process.env.KOMMO_CLIENT_ID;
  if (clientId && typeof claims.client_uuid === "string" && claims.client_uuid !== clientId)
    return { ok: false, reason: "client_uuid", claims };

  // Assinatura HMAC: o Kommo assina o widget_request com o client_secret,
  // tipicamente HS512 (aceita HS256/HS384 também).
  const algMap: Record<string, string> = { HS256: "sha256", HS384: "sha384", HS512: "sha512" };
  const hash = typeof header.alg === "string" ? algMap[header.alg] : undefined;
  if (hash) {
    const secret = process.env.KOMMO_CLIENT_SECRET ?? "";
    const expected = crypto.createHmac(hash, secret).update(`${h}.${p}`).digest("base64url");
    if (expected !== s) return { ok: false, reason: "assinatura", claims };
  }
  return { ok: true, claims };
}

/**
 * Quando o `widget_request` não traz o telefone (o macro {{contact.phone}} costuma
 * vir vazio em contato de WhatsApp), busca o telefone na API do Kommo a partir do
 * `entity_id` do JWT (entity_type 1 = contato, 2 = lead). Precisa de KOMMO_TOKEN
 * válido; falha silenciosa (retorna null) se não der.
 */
async function phoneFromKommo(claims: Record<string, unknown> | undefined): Promise<string | null> {
  if (!claims) return null;
  const sub = process.env.KOMMO_SUBDOMAIN;
  const token = process.env.KOMMO_TOKEN;
  const entityId = claims.entity_id;
  const entityType = String(claims.entity_type ?? "");
  if (!sub || !token || !entityId) return null;
  const base = `https://${sub}.kommo.com/api/v4`;
  const auth = { Authorization: `Bearer ${token}` };

  const phoneOf = (contact: unknown): string | null => {
    const fields = (contact as { custom_fields_values?: unknown })?.custom_fields_values;
    if (!Array.isArray(fields)) return null;
    for (const f of fields) {
      const fc = (f as { field_code?: string })?.field_code;
      if (fc === "PHONE") {
        const v = (f as { values?: Array<{ value?: unknown }> })?.values?.[0]?.value;
        if (v) return String(v);
      }
    }
    return null;
  };

  try {
    let contactId: number | null = null;
    if (entityType === "1") {
      contactId = Number(entityId);
    } else {
      // lead (ou outro) → pega o contato principal do lead
      const r = await fetch(`${base}/leads/${entityId}?with=contacts`, { headers: auth });
      if (!r.ok) {
        console.warn("[kommo/brain] API lead falhou:", r.status);
        return null;
      }
      const lead = (await r.json()) as {
        _embedded?: { contacts?: Array<{ id: number; is_main?: boolean }> };
      };
      const contacts = lead._embedded?.contacts ?? [];
      const main = contacts.find((c) => c.is_main) ?? contacts[0];
      contactId = main?.id ?? null;
    }
    if (!contactId) return null;
    const rc = await fetch(`${base}/contacts/${contactId}`, { headers: auth });
    if (!rc.ok) {
      console.warn("[kommo/brain] API contato falhou:", rc.status);
      return null;
    }
    return phoneOf(await rc.json());
  } catch (e) {
    console.error("[kommo/brain] phoneFromKommo erro:", e);
    return null;
  }
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

/**
 * Lê o corpo do widget_request de forma robusta. O Kommo NÃO manda JSON: manda
 * `application/x-www-form-urlencoded`, com chaves aninhadas tipo `data[phone]`.
 * Tenta JSON primeiro; se falhar, faz parse de form-urlencoded reconstruindo o
 * objeto `data`. Nunca lança — pior caso retorna {}.
 */
function parseBody(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const params = new URLSearchParams(raw);
    const out: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};
    for (const [k, v] of params.entries()) {
      const nested = k.match(/^data\[(.+)\]$/);
      if (nested) {
        data[nested[1]] = v;
      } else if (k === "data") {
        // `data` pode vir como string JSON.
        try {
          Object.assign(data, JSON.parse(v) as Record<string, unknown>);
        } catch {
          out.data = v;
        }
      } else {
        out[k] = v;
      }
    }
    if (Object.keys(data).length > 0) out.data = data;
    return out;
  }
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
  const rawText = await request.text();
  const contentType = request.headers.get("content-type") ?? "";

  // Loga o corpo CRU + content-type pra calibrar o contrato real do Kommo
  // (que manda form-urlencoded, não JSON).
  console.log(
    "[kommo/brain] content-type:",
    contentType,
    "| raw:",
    rawText.slice(0, 1500),
  );

  const body = parseBody(rawText);
  console.log("[kommo/brain] parsed:", JSON.stringify(body).slice(0, 1500));

  const token = typeof body.token === "string" ? body.token : "";
  const v = verifyKommoToken(token);
  if (!v.ok) {
    console.warn("[kommo/brain] JWT inválido:", v.reason);
    return NextResponse.json({ error: "unauthorized", reason: v.reason }, { status: 401 });
  }

  const returnUrl = pick(body, ["return_url", "returnUrl"]);
  const phonePayload = pick(body.data, ["phone", "telefone", "contact_phone", "from"]);
  const mensagem = pick(body.data, ["message", "message_text", "text"]);
  const claims = v.claims;

  if (!returnUrl) {
    console.warn("[kommo/brain] return_url ausente — payload:", JSON.stringify(body).slice(0, 500));
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Ack rápido (<2s). O trabalho pesado vai no after().
  after(async () => {
    try {
      // Telefone do payload; se veio vazio, busca via API do Kommo pelo entity_id.
      const phone = phonePayload || (await phoneFromKommo(claims));
      console.log("[kommo/brain] telefone resolvido:", phone ?? "(vazio)");
      const lead = phone ? await acharLead(phone) : null;
      console.log("[kommo/brain] lead:", lead ? `${lead.id} (${lead.nome})` : "(não encontrado)");

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
