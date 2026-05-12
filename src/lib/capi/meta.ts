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
    if (input.clickIds.fbclid) userData.fbc = input.clickIds.fbclid;

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
          action_source: "system_generated",
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
