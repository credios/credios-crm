import "server-only";

// ============================================================================
// Cliente Data Manager API — offline conversion import (GCLID) p/ Google Ads.
// ============================================================================
// O método legado (Google Ads API ConversionUploadService.UploadClickConversions)
// foi bloqueado pelo Google para integrações novas e será desligado em
// 15/06/2026. A via oficial agora é a Data Manager API:
//   POST https://datamanager.googleapis.com/v1/events:ingest
//   Escopo OAuth: https://www.googleapis.com/auth/datamanager
//
// Autentica com o refresh token (OAuth) → access token. Sem PII: usamos só
// GCLID/WBRAID/GBRAID. Idempotência via transactionId (= lead_id).
// Ver docs/GOOGLE_ADS_OFFLINE_CONVERSIONS.md.
// ============================================================================

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest";

export type GoogleAdsConversionType = "qualified" | "closed";

/** True quando todas as credenciais necessárias estão configuradas. */
export function isGoogleAdsEnabled(): boolean {
  return Boolean(
    process.env.GADS_CLIENT_ID &&
      process.env.GADS_CLIENT_SECRET &&
      process.env.GADS_REFRESH_TOKEN &&
      process.env.GADS_CUSTOMER_ID &&
      process.env.GADS_ACTION_QUALIFIED &&
      process.env.GADS_ACTION_CLOSED,
  );
}

// Em dev/teste, `validateOnly` valida o payload sem gravar conversões.
function isValidateOnly(): boolean {
  return process.env.GADS_VALIDATE_ONLY === "true";
}

const ACTION_ENV: Record<GoogleAdsConversionType, string> = {
  qualified: "GADS_ACTION_QUALIFIED",
  closed: "GADS_ACTION_CLOSED",
};

/**
 * O Data Manager usa o ID numérico da ação de conversão como
 * `productDestinationId`. Aceitamos tanto o resource name completo
 * (customers/X/conversionActions/ID) quanto o ID puro no env.
 */
function productDestinationId(type: GoogleAdsConversionType): string {
  const raw = process.env[ACTION_ENV[type]];
  if (!raw) throw new Error(`Variável ${ACTION_ENV[type]} não configurada`);
  const id = raw.includes("/") ? raw.split("/").pop()! : raw;
  if (!/^\d+$/.test(id)) {
    throw new Error(`ID de conversão inválido em ${ACTION_ENV[type]}: ${raw}`);
  }
  return id;
}

// Cache do access token (expira ~1h). Renovado sob demanda.
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GADS_CLIENT_ID!,
      client_secret: process.env.GADS_CLIENT_SECRET!,
      refresh_token: process.env.GADS_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      `OAuth token falhou (HTTP ${res.status}): ${data.error ?? ""} ${data.error_description ?? ""}`.trim(),
    );
  }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

/** Reseta o cache do token (usado em testes/diagnóstico). */
export function resetGoogleAdsTokenCache(): void {
  tokenCache = null;
}

/**
 * Envia uma conversão (Lead Qualificado ou Negócio Fechado) via GCLID/WBRAID/
 * GBRAID para o Google Ads, usando a Data Manager API. Lança em qualquer falha
 * (HTTP não-2xx ou erro parcial), pra o dispatcher marcar `failed` e reprocessar.
 */
export async function uploadConversion(opts: {
  type: GoogleAdsConversionType;
  orderId: string; // = lead_id (transactionId p/ idempotência)
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  valueCents?: number | null;
  conversionAt: Date;
}): Promise<void> {
  const accessToken = await getAccessToken();

  const adIdentifiers: Record<string, string> = {};
  if (opts.gclid) adIdentifiers.gclid = opts.gclid;
  if (opts.wbraid) adIdentifiers.wbraid = opts.wbraid;
  if (opts.gbraid) adIdentifiers.gbraid = opts.gbraid;

  const event: Record<string, unknown> = {
    eventTimestamp: opts.conversionAt.toISOString(), // RFC3339 (UTC) — sem ambiguidade de fuso
    transactionId: opts.orderId,
    eventSource: "WEB",
    adIdentifiers,
  };
  if (opts.valueCents != null) {
    event.conversionValue = opts.valueCents / 100;
    event.currency = "BRL";
  }

  const body = {
    destinations: [
      {
        operatingAccount: {
          accountType: "GOOGLE_ADS",
          accountId: process.env.GADS_CUSTOMER_ID!,
        },
        productDestinationId: productDestinationId(opts.type),
      },
    ],
    events: [event],
    validateOnly: isValidateOnly(),
  };

  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Data Manager ingest HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  // 2xx com erros parciais: a resposta traz um campo de erros/contagem de falhas.
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* corpo não-JSON — segue como sucesso */
  }
  const failures =
    (parsed.errorCount as number | undefined) ??
    (Array.isArray(parsed.errors) ? parsed.errors.length : undefined);
  if (failures) {
    throw new Error(`Data Manager ingest erros parciais: ${text.slice(0, 500)}`);
  }
}
