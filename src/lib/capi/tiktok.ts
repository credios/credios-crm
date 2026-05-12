// ============================================================================
// TikTok Events API adapter
// ============================================================================
// Spec: https://business-api.tiktok.com/portal/docs?id=1771101027431425
//
// Env vars:
//   TIKTOK_PIXEL_ID    - ID do Pixel (ex: C4XYZ...)
//   TIKTOK_ACCESS_TOKEN - Token de acesso
//   TIKTOK_TEST_CODE   - opcional; modo test events
// ============================================================================

import { hashEmail, hashPhone } from "./hashing";
import type { CapiAdapter, CapiResult, LeadConversionInput } from "./types";

function tiktokEventName(event: LeadConversionInput["event"]): string {
  switch (event) {
    case "lead_created":
      return "SubmitForm";
    case "lead_qualified":
      return "SubmitApplication";
    case "lead_closed":
      return "CompletePayment";
  }
}

export const tiktokCapiAdapter: CapiAdapter = {
  platform: "tiktok",

  isEnabled(): boolean {
    return Boolean(process.env.TIKTOK_PIXEL_ID && process.env.TIKTOK_ACCESS_TOKEN);
  },

  async send(input: LeadConversionInput): Promise<CapiResult> {
    if (!this.isEnabled()) {
      return { ok: false, platform: "tiktok", error: "not configured", skipped: true };
    }

    const pixelId = process.env.TIKTOK_PIXEL_ID!;
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN!;
    const testCode = process.env.TIKTOK_TEST_CODE;

    const user: Record<string, string> = {};
    const emailHash = hashEmail(input.email);
    const phoneHash = hashPhone(input.phone);
    if (emailHash) user.email = emailHash;
    if (phoneHash) user.phone = phoneHash;
    if (input.clickIds.ttclid) user.ttclid = input.clickIds.ttclid;

    if (Object.keys(user).length === 0) {
      return {
        ok: false,
        platform: "tiktok",
        error: "no user identifiers (email/phone/ttclid)",
        skipped: true,
      };
    }

    const payload = {
      pixel_code: pixelId,
      event: tiktokEventName(input.event),
      event_id: input.eventId,
      timestamp: input.eventTime.toISOString(),
      context: {
        user,
      },
      properties: input.valueCents != null
        ? {
            currency: input.currency,
            value: input.valueCents / 100,
          }
        : undefined,
      ...(testCode ? { test_event_code: testCode } : {}),
    };

    try {
      const res = await fetch(
        "https://business-api.tiktok.com/open_api/v1.3/event/track/",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Access-Token": accessToken,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          platform: "tiktok",
          error: `HTTP ${res.status} ${body.slice(0, 200)}`,
        };
      }
      return { ok: true, platform: "tiktok", eventId: input.eventId };
    } catch (err) {
      return {
        ok: false,
        platform: "tiktok",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
