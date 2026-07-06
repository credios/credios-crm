import crypto from "node:crypto";

// Token STATELESS da agenda pública: `base64url(leadId.exp).hmac`. Vai na
// resposta do webhook pro site montar a grade de horários — identifica o lead
// sem expor o UUID cru nem exigir tabela nova. Assinado com HMAC-SHA256;
// validade curta (48h — a janela de decisão é a tela de sucesso do simulador).

const TTL_HORAS = 48;

function secret(): string {
  const s = process.env.AGENDA_TOKEN_SECRET ?? process.env.WEBHOOK_SECRET;
  if (!s) throw new Error("AGENDA_TOKEN_SECRET/WEBHOOK_SECRET ausentes");
  return s;
}

function assinar(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function gerarAgendaToken(leadId: string, ttlHoras: number = TTL_HORAS): string {
  const exp = Date.now() + ttlHoras * 60 * 60 * 1000;
  const payload = Buffer.from(`${leadId}.${exp}`).toString("base64url");
  return `${payload}.${assinar(payload)}`;
}

/** Valida assinatura + expiração. Retorna o leadId ou null. */
export function validarAgendaToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let esperado: Buffer;
  let recebido: Buffer;
  try {
    esperado = Buffer.from(assinar(payload));
    recebido = Buffer.from(sig);
  } catch {
    return null;
  }
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) {
    return null;
  }
  const raw = Buffer.from(payload, "base64url").toString("utf8");
  const idx = raw.lastIndexOf(".");
  if (idx === -1) return null;
  const leadId = raw.slice(0, idx);
  const exp = Number(raw.slice(idx + 1));
  if (!leadId || !Number.isFinite(exp) || exp < Date.now()) return null;
  return leadId;
}
