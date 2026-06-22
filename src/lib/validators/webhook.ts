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
    // Enriquecimento: quando presente e o lead existe, o webhook ATUALIZA
    // esse lead em vez de criar um novo. Usado pelo fluxo de 2 etapas do
    // simulador do site (captura parcial → completa depois). Lead inexistente
    // (id antigo/inválido) cai no fluxo normal de criação (defensivo).
    lead_id: z.string().uuid().optional(),

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
    tipo_imovel_detalhes: z.string().trim().max(2000).optional().or(z.literal("")),
    situacao_imovel: z.string().trim().optional().or(z.literal("")),
    tipo_pessoa: tipoPessoaEnum.optional().or(z.literal("")),
    valor_imovel: z.coerce.number().nonnegative().optional(),
    // Saldo devedor — relevante apenas quando situacao_imovel = "Financiado".
    // Para imóveis quitados o site envia 0 ou omite; em ambos os casos vira NULL.
    saldo_devedor: z.coerce.number().nonnegative().optional(),
    valor_credito: z.coerce.number().nonnegative().optional(),

    // ── Endereço do imóvel (garantia) ────────────────────────────────────
    // Complemento opcional capturado após a qualificação no simulador.
    imovel_cep: z.string().trim().max(20).optional().or(z.literal("")),
    imovel_logradouro: z.string().trim().max(200).optional().or(z.literal("")),
    imovel_numero: z.string().trim().max(20).optional().or(z.literal("")),
    imovel_complemento: z.string().trim().max(120).optional().or(z.literal("")),
    imovel_bairro: z.string().trim().max(120).optional().or(z.literal("")),

    // ── Cônjuge / coobrigado ─────────────────────────────────────────────
    // Opcional; relevante quando estado_civil ∈ {Casado(a), União Estável}.
    // CPF/WhatsApp são normalizados server-side (digits / E.164).
    conjuge_nome: z.string().trim().max(200).optional().or(z.literal("")),
    conjuge_cpf: z.string().trim().optional().or(z.literal("")),
    conjuge_email: z.string().trim().optional().or(z.literal("")),
    // Data ISO (YYYY-MM-DD) enviada pelo site; aceita vazio.
    conjuge_nascimento: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
      .optional()
      .or(z.literal("")),
    conjuge_whatsapp: z.string().trim().optional().or(z.literal("")),
    // notify=false → enriquecimento silencioso (etapa parcial do simulador): o
    // CRM atualiza o lead mas NÃO dispara o e-mail de "Cadastro completo".
    notify: z.coerce.boolean().optional(),

    // ── Parceria (Portal de Parceiros) ───────────────────────────────────
    // Enviados pelo portal quando o lead é uma indicação de parceiro.
    parceiro_nome: z.string().trim().max(200).optional().or(z.literal("")),
    parceiro_portal_id: z.string().trim().max(64).optional().or(z.literal("")),
    observacoes_parceiro: z.string().trim().max(4000).optional().or(z.literal("")),

    // ── Tracking taxonomy (canônica, migration 0017) ─────────────────────
    // Site classifica e envia channel/source/paid; CRM valida contra
    // tracking_sources e reclassifica se vier inválido.
    channel: z.string().trim().optional().or(z.literal("")),
    source: z.string().trim().optional().or(z.literal("")),
    paid: z.coerce.boolean().optional(),
    // Origem legada — mirror de source pra retrocompatibilidade.
    origem: z.string().trim().optional().or(z.literal("")),

    // Multi-touch: array de toques anteriores ao submit.
    touches: z
      .array(
        z
          .object({
            timestamp: z.string().optional(),
            channel: z.string().optional(),
            source: z.string().optional(),
            paid: z.boolean().optional(),
            utm_source: z.string().optional(),
            utm_medium: z.string().optional(),
            utm_campaign: z.string().optional(),
            landing_page: z.string().optional(),
            referrer: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),

    utm_source: z.string().trim().optional().or(z.literal("")),
    utm_medium: z.string().trim().optional().or(z.literal("")),
    utm_campaign: z.string().trim().optional().or(z.literal("")),
    utm_term: z.string().trim().optional().or(z.literal("")),
    utm_content: z.string().trim().optional().or(z.literal("")),

    // ── Click IDs ────────────────────────────────────────────────────────
    gclid: z.string().trim().optional().or(z.literal("")),
    fbclid: z.string().trim().optional().or(z.literal("")),
    msclkid: z.string().trim().optional().or(z.literal("")),
    ttclid: z.string().trim().optional().or(z.literal("")),
    wbraid: z.string().trim().optional().or(z.literal("")),
    gbraid: z.string().trim().optional().or(z.literal("")),
    // Novos click IDs (migration 0017).
    li_fat_id: z.string().trim().optional().or(z.literal("")),
    twclid: z.string().trim().optional().or(z.literal("")),
    rdt_cid: z.string().trim().optional().or(z.literal("")),
    sccid: z.string().trim().optional().or(z.literal("")),
    pin_aid: z.string().trim().optional().or(z.literal("")),
    epik: z.string().trim().optional().or(z.literal("")),
    irclickid: z.string().trim().optional().or(z.literal("")),
    cjevent: z.string().trim().optional().or(z.literal("")),

    rede: z.string().trim().optional().or(z.literal("")),
    dispositivo: z.string().trim().optional().or(z.literal("")),
    palavra_chave: z.string().trim().optional().or(z.literal("")),
    grupo_anuncios: z.string().trim().optional().or(z.literal("")),
    criativo: z.string().trim().optional().or(z.literal("")),
    tipo_correspondencia: z.string().trim().optional().or(z.literal("")),
    referrer: z.string().trim().optional().or(z.literal("")),
    referrer_parsed: z.string().trim().optional().or(z.literal("")),
    pagina_entrada: z.string().trim().optional().or(z.literal("")),
    network: z.string().trim().optional().or(z.literal("")),
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
