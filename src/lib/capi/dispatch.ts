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

export type CapiLeadFields = {
  id: string;
  email?: string | null;
  whatsapp?: string | null;
  nome?: string | null;
  cidade?: string | null;
  estado?: string | null;
  comissaoCentavos?: number | null;
  fbclid?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  ttclid?: string | null;
  liFatId?: string | null;
  gclid?: string | null;
  msclkid?: string | null;
};

// ── Evento de topo (lead_created) ───────────────────────────────────────────

/**
 * Dispara o `Lead` server-side — o par do `fbq('track','Lead')` do site.
 *
 * Duas regras que parecem detalhe e definem se a campanha aprende ou desaprende:
 *
 * 1. **Só para cadastro COMPLETO e não recusado.** O simulador cria um lead
 *    PARCIAL (nome + telefone) antes de conhecer renda e saldo devedor; boa
 *    parte deles é recusada depois pela pré-qualificação em
 *    /continuar-simulacao. Mandar `Lead` no parcial ensinaria a Meta a comprar
 *    exatamente o público que o nosso próprio filtro rejeita — e é o oposto do
 *    motivo de ligar a CAPI. O browser já usa esse mesmo critério (o pixel só
 *    dispara `Lead` no cadastro completo qualificado), então os dois lados
 *    ficam falando do mesmo evento.
 *
 * 2. **`eventId` = o `meta_event_id` gerado no browser**, quando existir. Pixel
 *    e CAPI só deduplicam quando mandam event_name + event_id IDÊNTICOS. Com
 *    ids diferentes o Meta conta duas conversões para o mesmo lead e infla
 *    justamente o sinal de topo. O fallback `<id>:lead_created` é estável por
 *    lead, então também é idempotente contra reenvio — só não casa com o
 *    browser (caso do lead que chegou sem o pixel ter rodado).
 */
export async function capiOnLeadCreated(
  lead: CapiLeadFields & {
    objetivoCredito?: string | null;
    status?: string | null;
    createdAt?: Date | null;
    paginaEntrada?: string | null;
  },
  metaEventId?: string | null,
): Promise<void> {
  if (!lead.objetivoCredito) return; // parcial — ainda não é conversão
  if (lead.status === "desqualificado") return; // recusado pela pré-qualificação

  await dispatchCapi({
    event: "lead_created",
    eventTime: lead.createdAt ?? new Date(),
    eventId: metaEventId?.trim() || `${lead.id}:lead_created`,
    email: lead.email ?? null,
    phone: lead.whatsapp ?? null,
    valueCents: null,
    currency: "BRL",
    clickIds: {
      fbclid: lead.fbclid ?? null,
      ttclid: lead.ttclid ?? null,
      li_fat_id: lead.liFatId ?? null,
      gclid: lead.gclid ?? null,
      msclkid: lead.msclkid ?? null,
    },
    fbp: lead.fbp ?? null,
    fbc: lead.fbc ?? null,
    eventSourceUrl: lead.paginaEntrada ?? null,
    firstName: lead.nome?.split(" ")[0] ?? null,
    city: lead.cidade ?? null,
    state: lead.estado ?? null,
  });
}

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
    fbp: lead.fbp ?? null,
    fbc: lead.fbc ?? null,
    firstName: lead.nome?.split(" ")[0] ?? null,
    city: lead.cidade ?? null,
    state: lead.estado ?? null,
  });
}
