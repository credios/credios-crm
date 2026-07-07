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

// ── Eventos de funil (qualificação/fechamento) ──────────────────────────────
// Chamado pelo hub de mudança de estágio (google-ads/dispatcher.onLeadStageChange,
// que TODOS os caminhos de status já invocam). eventId estável por lead+evento
// → as plataformas dedupam reenvios (Meta/TikTok dedupe por event_id).

const CAPI_QUALIFIED_STAGES = new Set([
  "aguardando_documentacao",
  "documentacao_enviada",
  "aguardando_cadastro",
  "em_negociacao",
]);

type CapiLeadFields = {
  id: string;
  email?: string | null;
  whatsapp?: string | null;
  nome?: string | null;
  cidade?: string | null;
  estado?: string | null;
  comissaoCentavos?: number | null;
  fbclid?: string | null;
  ttclid?: string | null;
  liFatId?: string | null;
  gclid?: string | null;
  msclkid?: string | null;
};

export async function capiOnStageChange(
  lead: CapiLeadFields,
  newStatus: string,
): Promise<void> {
  const event = CAPI_QUALIFIED_STAGES.has(newStatus)
    ? ("lead_qualified" as const)
    : newStatus === "fechado"
      ? ("lead_closed" as const)
      : null;
  if (!event) return;
  await dispatchCapi({
    event,
    eventTime: new Date(),
    eventId: `${lead.id}:${event}`,
    email: lead.email ?? null,
    phone: lead.whatsapp ?? null,
    valueCents: event === "lead_closed" ? (lead.comissaoCentavos ?? null) : null,
    currency: "BRL",
    clickIds: {
      fbclid: lead.fbclid ?? null,
      ttclid: lead.ttclid ?? null,
      li_fat_id: lead.liFatId ?? null,
      gclid: lead.gclid ?? null,
      msclkid: lead.msclkid ?? null,
    },
    firstName: lead.nome?.split(" ")[0] ?? null,
    city: lead.cidade ?? null,
    state: lead.estado ?? null,
  });
}
