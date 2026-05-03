import { z } from "zod";

const estadoCivilEnum = z.enum([
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "Viúvo(a)",
  "União Estável",
]);

const tipoPessoaEnum = z.enum(["Pessoa Física", "Pessoa Jurídica"]);

/**
 * Payload aceito por POST /api/webhooks/lead.
 * Snake_case porque vem do site da Credios (compatibilidade Notion).
 * `passthrough` para preservar campos extras no `raw_payload`.
 */
export const webhookLeadPayloadSchema = z
  .object({
    // Dados pessoais
    nome: z.string().trim().min(2, "Nome muito curto").max(200),
    cpf: z.string().trim().optional().or(z.literal("")),
    estado_civil: estadoCivilEnum.optional().or(z.literal("")),
    ocupacao: z.string().trim().optional().or(z.literal("")),
    renda_mensal: z.coerce.number().nonnegative().optional(),
    whatsapp: z.string().trim().min(8, "WhatsApp obrigatório"),
    email: z.string().trim().email().optional().or(z.literal("")),
    cidade: z.string().trim().optional().or(z.literal("")),
    estado: z.string().trim().length(2, "UF de 2 letras").optional().or(z.literal("")),

    // Operação
    produto: z.string().default("CGI"),
    objetivo_credito: z.string().trim().optional().or(z.literal("")),
    tipo_imovel: z.string().trim().optional().or(z.literal("")),
    situacao_imovel: z.string().trim().optional().or(z.literal("")),
    tipo_pessoa: tipoPessoaEnum.optional().or(z.literal("")),
    valor_imovel: z.coerce.number().nonnegative().optional(),
    valor_credito: z.coerce.number().nonnegative().optional(),

    // Tracking
    origem: z.string().trim().optional().or(z.literal("")),
    utm_source: z.string().trim().optional().or(z.literal("")),
    utm_medium: z.string().trim().optional().or(z.literal("")),
    utm_campaign: z.string().trim().optional().or(z.literal("")),
    utm_term: z.string().trim().optional().or(z.literal("")),
    utm_content: z.string().trim().optional().or(z.literal("")),
    gclid: z.string().trim().optional().or(z.literal("")),
    // Novos click IDs — Meta (orgânico/pago), Microsoft Ads, TikTok Ads,
    // Google App Tracking Transparency (iOS).
    fbclid: z.string().trim().optional().or(z.literal("")),
    msclkid: z.string().trim().optional().or(z.literal("")),
    ttclid: z.string().trim().optional().or(z.literal("")),
    wbraid: z.string().trim().optional().or(z.literal("")),
    gbraid: z.string().trim().optional().or(z.literal("")),
    rede: z.string().trim().optional().or(z.literal("")),
    dispositivo: z.string().trim().optional().or(z.literal("")),
    palavra_chave: z.string().trim().optional().or(z.literal("")),
    grupo_anuncios: z.string().trim().optional().or(z.literal("")),
    criativo: z.string().trim().optional().or(z.literal("")),
    tipo_correspondencia: z.string().trim().optional().or(z.literal("")),
    referrer: z.string().trim().optional().or(z.literal("")),
    pagina_entrada: z.string().trim().optional().or(z.literal("")),
  })
  .passthrough();

export type WebhookLeadPayload = z.infer<typeof webhookLeadPayloadSchema>;

/** Normaliza string vazia ou whitespace para null (DB-friendly). */
export function emptyToNull(v: string | undefined | null): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** Normaliza CPF para apenas dígitos (11 dígitos). Retorna null se inválido. */
export function normalizarCpf(cpf: string | null): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

/** Normaliza WhatsApp para E.164 (+55XX...). Mantém só dígitos com +. */
export function normalizarWhatsapp(num: string | null): string | null {
  if (!num) return null;
  const cleaned = num.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  // Se não começa com +, assume Brasil.
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 11 || cleaned.length === 10) return `+55${cleaned}`;
  return cleaned;
}

/** Reais → centavos. Aceita number ou null/undefined. */
export function reaisParaCentavos(reais: number | null | undefined): number | null {
  if (reais == null) return null;
  return Math.round(reais * 100);
}
