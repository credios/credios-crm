import crypto from "node:crypto";

import { after, NextResponse, type NextRequest } from "next/server";

import { enviarTextoWhatsApp } from "@/lib/whatsapp/meta";
import { responderMensagem } from "@/lib/whatsapp/responder";
import { transcreverAudioWhatsapp } from "@/lib/whatsapp/transcrever";

/**
 * Webhook do WhatsApp (Meta Cloud API) — Objetivo 3, arquitetura direta.
 *
 * GET  → verificação do webhook (handshake do Meta).
 * POST → mensagens entrantes do cliente → Heloísa responde via Meta.
 *
 * O número automático da Credios aponta o webhook pra cá. Sem Kommo no caminho:
 * o cérebro identifica o lead no nosso CRM, qualifica e responde direto pelo Meta.
 */

// Tipos mínimos do payload do Meta (evita `any`).
type MetaMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string }; // resposta de botão de template
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  audio?: { id?: string; mime_type?: string }; // nota de voz / áudio
};
type MetaChange = { value?: { messages?: MetaMessage[] } };
type MetaEntry = { changes?: MetaChange[] };
type MetaPayload = { entry?: MetaEntry[] };

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();

  // Verifica a assinatura do Meta (X-Hub-Signature-256) se o app secret estiver setado.
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const sig = request.headers.get("x-hub-signature-256") ?? "";
    const expected =
      "sha256=" + crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      console.warn("[whatsapp] assinatura inválida");
      return new NextResponse("invalid signature", { status: 401 });
    }
  }

  let body: MetaPayload;
  try {
    body = JSON.parse(raw) as MetaPayload;
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Extrai mensagens entrantes: texto livre, resposta de botão, ou áudio (nota de
  // voz → guarda o media_id pra transcrever no after()). Outros tipos → texto vazio.
  const mensagens: { from: string; text: string; audioId?: string }[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        if (!m.from) continue;
        let text = "";
        let audioId: string | undefined;
        if (m.type === "text") text = m.text?.body ?? "";
        else if (m.type === "button") text = m.button?.text ?? m.button?.payload ?? "";
        else if (m.type === "interactive")
          text = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
        else if (m.type === "audio") audioId = m.audio?.id;
        mensagens.push({ from: m.from, text, audioId });
      }
    }
  }

  // Ack rápido (<5s, senão o Meta re-envia). Processamento pesado no after():
  // transcrição do áudio + Heloísa. Áudio que falha vira "" → fallback "manda texto".
  after(async () => {
    for (const msg of mensagens) {
      try {
        const texto = msg.audioId
          ? await transcreverAudioWhatsapp(msg.audioId)
          : msg.text;
        console.log(
          "[whatsapp] recebido de",
          msg.from,
          msg.audioId ? "| (áudio) " : "| texto:",
          texto.slice(0, 200),
        );
        const resposta = await responderMensagem(msg.from, texto);
        if (resposta) await enviarTextoWhatsApp(msg.from, resposta);
      } catch (e) {
        console.error("[whatsapp] erro processando mensagem:", e);
      }
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
