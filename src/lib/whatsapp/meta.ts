// Cliente mínimo da WhatsApp Cloud API (Meta) — envio de mensagem de texto.
// Sem limite de 80 chars (isso era do handler `show` do Kommo); o WhatsApp
// aceita até ~4096 chars por mensagem.

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Envia uma mensagem de TEMPLATE aprovado (WABA) — obrigatório pra INICIAR uma
 * conversa (cliente ainda não falou; fora da janela de 24h). `variaveis` mapeia
 * os {{1}}, {{2}}... do corpo do template, na ordem.
 */
export async function enviarTemplateWhatsApp(
  to: string,
  templateName: string,
  languageCode: string,
  variaveis: string[] = [],
): Promise<{ ok: boolean; status: number }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.error("[whatsapp] credenciais ausentes (template não enviado)");
    return { ok: false, status: 0 };
  }
  const components =
    variaveis.length > 0
      ? [{ type: "body", parameters: variaveis.map((v) => ({ type: "text", text: v })) }]
      : [];
  try {
    const resp = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: templateName, language: { code: languageCode }, components },
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error("[whatsapp] template falhou:", resp.status, body.slice(0, 400));
    }
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    console.error("[whatsapp] template erro:", e);
    return { ok: false, status: 0 };
  }
}

export async function enviarTextoWhatsApp(
  to: string,
  texto: string,
): Promise<{ ok: boolean; status: number }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.error(
      "[whatsapp] credenciais ausentes (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)",
    );
    return { ok: false, status: 0 };
  }
  try {
    const resp = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: texto.slice(0, 4096) },
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error("[whatsapp] envio falhou:", resp.status, body.slice(0, 300));
    }
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    console.error("[whatsapp] envio erro:", e);
    return { ok: false, status: 0 };
  }
}
