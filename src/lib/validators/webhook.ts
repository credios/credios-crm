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
    // Composição de renda pelo cônjuge.
    conjuge_compoe_renda: z.coerce.boolean().optional(),
    conjuge_renda: z.coerce.number().nonnegative().optional(),
    conjuge_ocupacao: z.string().trim().optional().or(z.literal("")),
    // notify=false → enriquecimento silencioso (etapa parcial do simulador): o
    // CRM atualiza o lead mas NÃO dispara o e-mail de "Cadastro completo".
    notify: z.coerce.boolean().optional(),

    // ── Pré-qualificação automática do site ──────────────────────────────
    // O /continuar-simulacao recusa na hora (renda/saldo devedor fora da
    // política) e manda o enriquecimento com este flag: o lead parcial vira
    // `desqualificado` com o motivo, sem portal/agenda/proativo. Só tem efeito
    // no fluxo de ENRIQUECIMENTO (lead_id presente e existente).
    auto_desqualificar: z.coerce.boolean().optional(),
    motivo_desqualificacao: z.string().trim().max(500).optional().or(z.literal("")),

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

    // ── Meta: correspondência e deduplicação da Conversions API ──────────
    // Cookies do pixel (crus — o Meta não aceita hasheados) e o eventID do
    // `Lead` disparado no browser. O event_id PRECISA ser o mesmo nos dois
    // lados, senão o Meta conta a mesma conversão duas vezes.
    fbp: z.string().trim().optional().or(z.literal("")),
    fbc: z.string().trim().optional().or(z.literal("")),
    meta_event_id: z.string().trim().optional().or(z.literal("")),

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

/**
 * Normaliza WhatsApp para E.164 (+55DDNNNNNNNNN). Brasil completo = 13 díg
 * (móvel: 55 + DDD + 9 dígitos) ou 12 (fixo: 55 + DDD + 8).
 *
 * Trata o BUG do DDD 55 (Santa Rosa/Santa Maria-RS etc.) "colapsado" com o
 * código do país: o site às vezes manda "+55 9XXXXXXXX" (11 díg, SEM o DDD,
 * porque o DDD 55 == país 55 e algum mask removeu um). Como esse é o único DDD
 * que some nesse colapso, prefixar 55 reconstrói +55 55 9XXXXXXXX corretamente.
 * NÃO confiamos cegamente no "+": validamos o tamanho.
 */
export function normalizarWhatsapp(num: string | null): string | null {
  if (!num) return null;
  const temMais = num.trim().startsWith("+");
  const d = num.replace(/\D/g, "");
  if (!d) return null;

  // Internacional explícito (+ e país ≠ 55): respeita como veio.
  if (temMais && !d.startsWith("55")) return `+${d}`;

  // Brasil já completo (com país): 13 díg (móvel) ou 12 (fixo).
  if (d.startsWith("55") && (d.length === 13 || d.length === 12)) return `+${d}`;

  // Sem país: DDD + assinante = 11 díg (móvel) ou 10 (fixo) → prefixa 55.
  // Cobre o colapso do DDD 55: "+55 9XXXXXXXX" (11 díg) vira +55 55 9XXXXXXXX.
  if (d.length === 11 || d.length === 10) return `+55${d}`;

  // Fora do padrão: melhor esforço — garante + e país quando faz sentido.
  return d.startsWith("55") ? `+${d}` : `+55${d}`;
}

/** Reais → centavos. Aceita number ou null/undefined. */
export function reaisParaCentavos(reais: number | null | undefined): number | null {
  if (reais == null) return null;
  return Math.round(reais * 100);
}
