// ============================================================================
// LinkedIn Conversions API adapter
// ============================================================================
// Spec: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api
//
// Env vars:
//   LINKEDIN_CONVERSION_ID - ID da conversion definition (criada no Campaign Manager)
//   LINKEDIN_ACCESS_TOKEN  - OAuth token com escopo `r_ads_conversions`
// ============================================================================

import { hashEmail } from "./hashing";
import type { CapiAdapter, CapiResult, LeadConversionInput } from "./types";

export const linkedinCapiAdapter: CapiAdapter = {
  platform: "linkedin",

  isEnabled(): boolean {
    return Boolean(
      process.env.LINKEDIN_CONVERSION_ID && process.env.LINKEDIN_ACCESS_TOKEN,
    );
  },

  async send(input: LeadConversionInput): Promise<CapiResult> {
    if (!this.isEnabled()) {
      return {
        ok: false,
        platform: "linkedin",
        error: "not configured",
        skipped: true,
      };
    }

    const conversionId = process.env.LINKEDIN_CONVERSION_ID!;
    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN!;

    // LinkedIn requer email hasheado SHA-256 ou LinkedIn Member ID.
    const emailHash = hashEmail(input.email);
    if (!emailHash && !input.clickIds.li_fat_id) {
      return {
        ok: false,
        platform: "linkedin",
        error: "no user identifiers (email/li_fat_id)",
        skipped: true,
      };
    }

    const payload: Record<string, unknown> = {
      conversion: `urn:lla:llaPartnerConversion:${conversionId}`,
      conversionHappenedAt: input.eventTime.getTime(),
      conversionValue:
        input.valueCents != null
          ? {
              currencyCode: input.currency,
              amount: String(input.valueCents / 100),
            }
          : undefined,
      eventId: input.eventId,
      user: {
        ...(emailHash
          ? {
              userIds: [{ idType: "SHA256_EMAIL", idValue: emailHash }],
            }
          : {}),
      },
    };

    try {
      const res = await fetch(
        "https://api.linkedin.com/rest/conversionEvents",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "LinkedIn-Version": "202410",
            "X-Restli-Protocol-Version": "2.0.0",
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          platform: "linkedin",
          error: `HTTP ${res.status} ${body.slice(0, 200)}`,
        };
      }
      return { ok: true, platform: "linkedin", eventId: input.eventId };
    } catch (err) {
      return {
        ok: false,
        platform: "linkedin",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
