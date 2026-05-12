// ============================================================================
// CAPI dispatcher — envia evento pra TODAS as plataformas configuradas
// em paralelo, sem bloquear umas pelas outras.
// ============================================================================
// Quando uma plataforma não está configurada (env var ausente), retorna
// `skipped: true` em vez de erro. Logs ficam em console pra o admin
// monitorar no Vercel logs.
//
// Uso:
//   await dispatchCapi({
//     event: "lead_created",
//     eventTime: new Date(),
//     eventId: lead.id + ":created",
//     email: lead.email,
//     phone: lead.whatsapp,
//     valueCents: null,
//     currency: "BRL",
//     clickIds: { fbclid: lead.fbclid, ttclid: lead.ttclid, ... },
//   });
// ============================================================================

import { linkedinCapiAdapter } from "./linkedin";
import { metaCapiAdapter } from "./meta";
import { tiktokCapiAdapter } from "./tiktok";
import type { CapiAdapter, CapiResult, LeadConversionInput } from "./types";

const ADAPTERS: CapiAdapter[] = [
  metaCapiAdapter,
  tiktokCapiAdapter,
  linkedinCapiAdapter,
];

export async function dispatchCapi(
  input: LeadConversionInput,
): Promise<CapiResult[]> {
  const results = await Promise.all(
    ADAPTERS.map(async (adapter) => {
      try {
        return await adapter.send(input);
      } catch (err) {
        return {
          ok: false as const,
          platform: adapter.platform,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  // Log de erros (skipped não é erro — é "não configurado")
  for (const r of results) {
    if (!r.ok && !("skipped" in r && r.skipped)) {
      console.error(
        `[capi] ${r.platform} falhou pra evento ${input.event}:`,
        r.error,
      );
    }
  }

  return results;
}

/** Retorna lista de plataformas configuradas (pra dashboard/debug). */
export function listEnabledCapiPlatforms(): string[] {
  return ADAPTERS.filter((a) => a.isEnabled()).map((a) => a.platform);
}
