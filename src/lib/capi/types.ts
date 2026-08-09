// ============================================================================
// CAPI (Conversions API) — tipos compartilhados entre adapters
// ============================================================================
// Cada plataforma (Meta, TikTok, LinkedIn, etc) tem sua própria API server-side
// pra registrar eventos de conversão. Esta camada normaliza:
//   - Input (lead data + click IDs hasheados quando aplicável)
//   - Resultado (sucesso/erro, sem expor detalhes específicos da plataforma)
//
// Cada adapter:
//   1. Recebe LeadConversionInput
//   2. Hasheia PII (email/phone) com SHA-256 antes de mandar
//   3. Posta no endpoint server-side da plataforma
//   4. Retorna CapiResult padronizado
// ============================================================================

export type LeadConversionEvent =
  | "lead_created"        // Lead chegou (top of funnel)
  | "lead_qualified"      // Lead avançou pra documentação ou negociação
  | "lead_closed";        // Lead virou cliente (operação fechada)

export type LeadConversionInput = {
  event: LeadConversionEvent;
  /** Hora do evento (ISO). Usado como event_time pelas APIs. */
  eventTime: Date;
  /** Identificador único do evento (idempotência). Tipicamente lead.id + event. */
  eventId: string;
  /** Email do lead (será hasheado SHA-256). */
  email: string | null;
  /** Phone em E.164 (será hasheado SHA-256). */
  phone: string | null;
  /** Valor monetário (ex: comissão fechada) em centavos. */
  valueCents: number | null;
  currency: string; // ISO 4217 (e.g., "BRL")
  /** Click IDs disponíveis (cada adapter usa o seu). */
  clickIds: {
    fbclid?: string | null;
    ttclid?: string | null;
    li_fat_id?: string | null;
    gclid?: string | null;
    msclkid?: string | null;
  };
  /**
   * Cookies do Meta Pixel, crus (o Meta NÃO aceita hasheado nestes dois).
   * `fbc` precisa estar no formato `fb.1.<timestamp_ms>.<fbclid>`; o adapter
   * reconstrói a partir do fbclid quando vier vazio.
   */
  fbp?: string | null;
  fbc?: string | null;
  /**
   * URL onde a conversão aconteceu. Obrigatória junto de
   * `action_source: "website"` — só faz sentido nos eventos que nasceram de
   * uma ação do usuário no site (lead_created), não nos que nascem no CRM.
   */
  eventSourceUrl?: string | null;
  /** Metadata extra (alguma plataforma pode usar — ex: lead nome em hash). */
  firstName?: string | null;
  city?: string | null;
  state?: string | null;
};

export type CapiResult =
  | { ok: true; platform: string; eventId: string }
  | { ok: false; platform: string; error: string; skipped?: boolean };

export interface CapiAdapter {
  /** Nome canônico ("meta", "tiktok", "linkedin", "google") */
  readonly platform: string;
  /** True se variáveis de ambiente estão configuradas pra enviar. */
  isEnabled(): boolean;
  /** Envia evento pra plataforma. Lança erro só se falha grave (rede); demais erros viram CapiResult.ok=false. */
  send(input: LeadConversionInput): Promise<CapiResult>;
}
