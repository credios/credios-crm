// ============================================================================
// Meta Conversions API (CAPI) adapter
// ============================================================================
// Spec: https://developers.facebook.com/docs/marketing-api/conversions-api/
//
// Env vars:
//   META_PIXEL_ID         - ID do Pixel (ex: 1234567890)
//   META_ACCESS_TOKEN     - System User token com permissão de manage_ads
//   META_TEST_EVENT_CODE  - opcional; usado pra testar em modo "test events" antes de live
//
// Eventos mapeados:
//   lead_created   → "Lead" (standard Meta event)
//   lead_qualified → "SubmitApplication" (mais alta intent)
//   lead_closed    → "Purchase"
// ============================================================================

import { hashEmail, hashName, hashPhone } from "./hashing";
import type { CapiAdapter, CapiResult, LeadConversionInput } from "./types";

const META_API_VERSION = "v21.0";

function metaEventName(event: LeadConversionInput["event"]): string {
  switch (event) {
    case "lead_created":
      return "Lead";
    case "lead_qualified":
      return "SubmitApplication";
    case "lead_closed":
      return "Purchase";
  }
}

/**
 * `action_source` diz ao Meta ONDE a conversão aconteceu, e ele usa isso pra
 * atribuição e pra checar consistência com o evento do browser.
 *
 *   lead_created → o usuário preencheu um formulário no site  → "website"
 *                  (exige `event_source_url`, e é o evento que deduplica com
 *                  o `Lead` do pixel)
 *   demais       → mudança de estágio dentro do CRM, sem usuário na frente da
 *                  tela → "system_generated"
 */
function metaActionSource(event: LeadConversionInput["event"]): string {
  return event === "lead_created" ? "website" : "system_generated";
}

/**
 * Monta o `fbc` no ÚNICO formato que a Conversions API aceita:
 * `fb.<subdomainIndex>.<creationTime_ms>.<fbclid>`.
 *
 * O fbclid cru é silenciosamente descartado pelo Meta — mandar ele direto
 * (como estava antes) equivale a não mandar correspondência nenhuma, logo na
 * origem em que ela mais importa: tráfego pago de Meta.
 *
 * O ideal é o cookie `_fbc` que o fbevents escreveu, porque carrega o
 * timestamp real do clique. Quando ele não chega — in-app browser do
 * Instagram/Facebook descarta cookies, que é justamente o navegador desse
 * tráfego — reconstruímos com o horário do evento. O timestamp aproximado
 * degrada um pouco a janela de atribuição, mas é muito melhor que perder o
 * identificador inteiro.
 *
 * `subdomainIndex` = 1 para `www.credios.com.br` (regra do Meta: conta os
 * pontos do domínio a partir do topo, sem o TLD).
 */
function buildFbc(
  cookieFbc: string | null | undefined,
  fbclid: string | null | undefined,
  eventTime: Date,
): string | null {
  const fromCookie = cookieFbc?.trim();
  if (fromCookie) return fromCookie;
  const id = fbclid?.trim();
  if (!id) return null;
  return `fb.1.${eventTime.getTime()}.${id}`;
}

export const metaCapiAdapter: CapiAdapter = {
  platform: "meta",

  isEnabled(): boolean {
    return Boolean(process.env.META_PIXEL_ID && process.env.META_ACCESS_TOKEN);
  },

  async send(input: LeadConversionInput): Promise<CapiResult> {
    if (!this.isEnabled()) {
      return { ok: false, platform: "meta", error: "not configured", skipped: true };
    }

    const pixelId = process.env.META_PIXEL_ID!;
    const accessToken = process.env.META_ACCESS_TOKEN!;
    const testCode = process.env.META_TEST_EVENT_CODE;

    const userData: Record<string, string> = {};
    const emailHash = hashEmail(input.email);
    const phoneHash = hashPhone(input.phone);
    const firstNameHash = hashName(input.firstName ?? null);
    const cityHash = hashName(input.city ?? null);
    const stateHash = hashName(input.state ?? null);
    if (emailHash) userData.em = emailHash;
    if (phoneHash) userData.ph = phoneHash;
    if (firstNameHash) userData.fn = firstNameHash;
    if (cityHash) userData.ct = cityHash;
    if (stateHash) userData.st = stateHash;
    // fbc/fbp vão CRUS — o Meta rejeita esses dois hasheados (são
    // identificadores dele, não PII nossa).
    const fbc = buildFbc(input.fbc, input.clickIds.fbclid, input.eventTime);
    if (fbc) userData.fbc = fbc;
    const fbp = input.fbp?.trim();
    if (fbp) userData.fbp = fbp;

    // Sem nenhum sinal de identificação → Meta rejeita.
    if (Object.keys(userData).length === 0) {
      return {
        ok: false,
        platform: "meta",
        error: "no user identifiers (email/phone/fbclid)",
        skipped: true,
      };
    }

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: metaEventName(input.event),
          event_time: Math.floor(input.eventTime.getTime() / 1000),
          event_id: input.eventId,
          action_source: metaActionSource(input.event),
          ...(input.eventSourceUrl
            ? { event_source_url: input.eventSourceUrl }
            : {}),
          user_data: userData,
          custom_data:
            input.valueCents != null
              ? {
                  currency: input.currency,
                  value: input.valueCents / 100,
                }
              : undefined,
        },
      ],
    };
    if (testCode) payload.test_event_code = testCode;

    try {
      const res = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          platform: "meta",
          error: `HTTP ${res.status} ${body.slice(0, 200)}`,
        };
      }
      return { ok: true, platform: "meta", eventId: input.eventId };
    } catch (err) {
      return {
        ok: false,
        platform: "meta",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
