import crypto from "node:crypto";

// Cliente mínimo da Google Calendar API via conta de serviço + delegação de
// domínio (Workspace). Impersona o consultor (subject = e-mail dele) pra ler a
// disponibilidade e criar eventos na agenda REAL dele, sem login por usuário.
// Sem dependência externa (JWT assinado com node:crypto + REST), no espírito lean.

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const CAL_API = "https://www.googleapis.com/calendar/v3";
const TZ = "America/Sao_Paulo";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

function clientEmail(): string {
  return process.env.GOOGLE_SA_CLIENT_EMAIL ?? "";
}
function privateKey(): string {
  // Aceita a chave com \n escapado (formato do JSON / env) ou com quebras reais.
  return (process.env.GOOGLE_SA_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Cache de token por consultor (validade ~1h). Evita re-assinar JWT a cada chamada.
const tokenCache = new Map<string, { token: string; exp: number }>();

/** Access token impersonando `subject` (e-mail do consultor) via delegação. */
export async function getAccessToken(subject: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(subject);
  if (cached && cached.exp - 60 > now) return cached.token;

  const email = clientEmail();
  const key = privateKey();
  if (!email || !key) {
    throw new Error("GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY ausentes");
  }

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: email, sub: subject, scope: SCOPES, aud: TOKEN_URI, iat: now, exp: now + 3600 }),
  );
  const sig = b64url(crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key));
  const assertion = `${header}.${claims}.${sig}`;

  const resp = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!resp.ok || !data.access_token) {
    throw new Error(`google token: ${data.error ?? resp.status} ${data.error_description ?? ""}`.trim());
  }
  tokenCache.set(subject, { token: data.access_token, exp: now + (data.expires_in ?? 3600) });
  return data.access_token;
}

export type BusyInterval = { start: string; end: string };

/** Intervalos OCUPADOS na agenda do consultor entre timeMin/timeMax (ISO). */
export async function freeBusy(
  subject: string,
  timeMinISO: string,
  timeMaxISO: string,
): Promise<BusyInterval[]> {
  const token = await getAccessToken(subject);
  const resp = await fetch(`${CAL_API}/freeBusy`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ timeMin: timeMinISO, timeMax: timeMaxISO, timeZone: TZ, items: [{ id: subject }] }),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    calendars?: Record<string, { busy?: BusyInterval[] }>;
  };
  if (!resp.ok) throw new Error(`google freebusy: ${JSON.stringify(data).slice(0, 200)}`);
  return data.calendars?.[subject]?.busy ?? [];
}

export type NovoEvento = {
  subject: string; // consultor (dono da agenda / organizador)
  titulo: string;
  descricao?: string;
  inicioISO: string;
  fimISO: string;
  convidados?: string[]; // e-mails (cliente)
};
export type EventoCriado = { eventId: string; meetLink: string | null; htmlLink: string | null };

/** Cria evento na agenda do consultor com link do Google Meet; convida participantes. */
export async function criarEvento(ev: NovoEvento): Promise<EventoCriado> {
  const token = await getAccessToken(ev.subject);
  const body = {
    summary: ev.titulo,
    description: ev.descricao,
    start: { dateTime: ev.inicioISO, timeZone: TZ },
    end: { dateTime: ev.fimISO, timeZone: TZ },
    attendees: (ev.convidados ?? []).map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const url =
    `${CAL_API}/calendars/${encodeURIComponent(ev.subject)}/events` +
    `?conferenceDataVersion=1&sendUpdates=all`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    id?: string;
    hangoutLink?: string;
    htmlLink?: string;
  };
  if (!resp.ok || !data.id) throw new Error(`google createEvent: ${JSON.stringify(data).slice(0, 200)}`);
  return { eventId: data.id, meetLink: data.hangoutLink ?? null, htmlLink: data.htmlLink ?? null };
}

/**
 * Move um evento existente pra novo horário (remarcação). Usa PATCH pra manter o
 * MESMO link do Meet e a thread do convite — o Google envia "evento atualizado"
 * aos convidados. Notifica todos (sendUpdates=all).
 */
export async function atualizarHorarioEvento(
  subject: string,
  eventId: string,
  inicioISO: string,
  fimISO: string,
): Promise<void> {
  const token = await getAccessToken(subject);
  const url =
    `${CAL_API}/calendars/${encodeURIComponent(subject)}/events/${encodeURIComponent(eventId)}` +
    `?sendUpdates=all`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      start: { dateTime: inicioISO, timeZone: TZ },
      end: { dateTime: fimISO, timeZone: TZ },
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`google patchEvent: ${resp.status} ${body.slice(0, 200)}`);
  }
}

/**
 * MOVE um evento pra agenda de OUTRO consultor (reatribuição de lead com
 * reunião marcada). O organizador passa a ser o destino; o link do Meet e os
 * convidados são preservados; todos são notificados.
 */
export async function moverEvento(
  subjectAtual: string,
  eventId: string,
  destinoEmail: string,
): Promise<void> {
  const token = await getAccessToken(subjectAtual);
  const url =
    `${CAL_API}/calendars/${encodeURIComponent(subjectAtual)}/events/${encodeURIComponent(eventId)}/move` +
    `?destination=${encodeURIComponent(destinoEmail)}&sendUpdates=all`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`google moveEvent: ${resp.status} ${body.slice(0, 200)}`);
  }
}

/** Cancela/remove um evento (usado em remarcar/cancelar). Notifica os convidados. */
export async function deletarEvento(subject: string, eventId: string): Promise<void> {
  const token = await getAccessToken(subject);
  const url =
    `${CAL_API}/calendars/${encodeURIComponent(subject)}/events/${encodeURIComponent(eventId)}` +
    `?sendUpdates=all`;
  const resp = await fetch(url, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  // 410 = já removido; tratamos como sucesso (idempotente).
  if (!resp.ok && resp.status !== 410 && resp.status !== 404) {
    throw new Error(`google deleteEvent: ${resp.status}`);
  }
}
