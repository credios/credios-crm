import crypto from "node:crypto";

// Token STATELESS da agenda pública: `base64url(leadId.exp).hmac`. Vai na
// resposta do webhook pro site montar a grade de horários — identifica o lead
// sem expor o UUID cru nem exigir tabela nova. Assinado com HMAC-SHA256;
// validade curta (48h — a janela de decisão é a tela de sucesso do simulador).

const TTL_HORAS = 48;

function secrets(): string[] {
  // Assina sempre com o primeiro; verificação aceita todos (o WEBHOOK_SECRET
  // fica como legado pra tokens emitidos antes do secret dedicado — TTL 48h,
  // então o fallback pode ser removido dias depois do deploy).
  const lista = [process.env.AGENDA_TOKEN_SECRET, process.env.WEBHOOK_SECRET].filter(
    (x): x is string => !!x,
  );
  if (lista.length === 0) throw new Error("AGENDA_TOKEN_SECRET/WEBHOOK_SECRET ausentes");
  return lista;
}

function assinar(payload: string, secret = secrets()[0]!): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
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
  let valido = false;
  try {
    const recebido = Buffer.from(sig);
    for (const s of secrets()) {
      const esperado = Buffer.from(assinar(payload, s));
      if (esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido)) {
        valido = true;
        break;
      }
    }
  } catch {
    return null;
  }
  if (!valido) return null;
  const raw = Buffer.from(payload, "base64url").toString("utf8");
  const idx = raw.lastIndexOf(".");
  if (idx === -1) return null;
  const leadId = raw.slice(0, idx);
  const exp = Number(raw.slice(idx + 1));
  if (!leadId || !Number.isFinite(exp) || exp < Date.now()) return null;
  return leadId;
}
