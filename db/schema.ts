import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ============================================================================
// Schema auth do Supabase — referência apenas para FK de users.id
// (não exportado → drizzle-kit não inclui na migration)
// ============================================================================
const authSchema = pgSchema("auth");
const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

// ============================================================================
// Enums
// ============================================================================

export const perfilEnum = pgEnum("perfil", [
  "admin",
  "gerente",
  "consultor",
  "marketing",
]);

// status do lead virou TEXT livre (migration 0003) — keys e metadata são
// gerenciadas dinamicamente via tabela `status_lead_config` (admin pode
// criar/desativar/renomear pela UI). SYSTEM_STATUS_KEYS em
// src/lib/status/canonical.ts mantém os 10 keys originais que o app
// referencia direto pra lógica especial (fechado, desqualificado, etc.).

export const tipoInteracaoEnum = pgEnum("tipo_interacao", [
  "ligacao",
  "whatsapp_enviado",
  "whatsapp_recebido",
  "email",
  "reuniao",
  // `anotacao` é mantida por retrocompat (rows antigas) — porém a partir
  // da migration 0020 anotações vivem na tabela `lead_anotacoes` (editáveis,
  // deletáveis). Nada novo do tipo `anotacao` deve entrar em `interacoes`.
  "anotacao",
  // `contato` (genérico) — sem distinguir canal — quando o consultor
  // só quer registrar que houve contato. Adicionado na migration 0019.
  "contato",
  "mudanca_status",
  "mudanca_atribuicao",
  "documento_recebido",
  "evento_sistema",
  // Acontecimentos da operação (migration 0026) — trabalho de bastidor que o
  // consultor registra na timeline, mas que NÃO é contato com o cliente: não
  // atualiza `ultimo_contato`, não resolve SLA, não conta como "contatado hoje".
  // São acontecimentos manuais (autor preenchido), exibidos com acento próprio.
  "contato_banco",
  "analise_credito_solicitada",
  "vistoria_realizada",
]);

export const acaoRegraEnum = pgEnum("acao_regra", [
  "atribuir_usuario",
  "round_robin_grupo",
  "pool_nao_atribuido",
]);

export const tipoSlaEnum = pgEnum("tipo_sla", [
  "primeiro_contato_atrasado",
  "lead_esfriando",
]);

export const statusPropostaBancoEnum = pgEnum("status_proposta_banco", [
  "enviado",
  "em_analise",
  "aprovado",
  "recusado",
  "pendencia",
  "proposta_emitida",
]);

// ============================================================================
// users — extensão de auth.users (1:1)
// ============================================================================

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  perfil: perfilEnum("perfil").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  whatsapp: text("whatsapp"),
  // Última vez que o user marcou notificações como lido. NULL = nunca marcou
  // (todos leads recentes contam). Updated por POST /api/notifications/seen.
  notificationsSeenAt: timestamp("notifications_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// leads — entidade principal
// ============================================================================

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // --- Dados pessoais ---
    nome: text("nome").notNull(),
    cpf: text("cpf"),
    estadoCivil: text("estado_civil"),
    ocupacao: text("ocupacao"),
    rendaMensalCentavos: bigint("renda_mensal_centavos", { mode: "number" }),
    whatsapp: text("whatsapp"),
    email: text("email"),
    cidade: text("cidade"),
    estado: text("estado"), // UF de 2 letras

    // --- Operação ---
    produto: text("produto").notNull().default("CGI"),
    objetivoCredito: text("objetivo_credito"),
    tipoImovel: text("tipo_imovel"),
    // Esclarecimento livre sobre o tipo de imóvel — preenchido apenas
    // quando o cliente seleciona "Terreno" ou "Outro" no simulador (essas
    // categorias têm aceitação restrita por banco e exigem triagem manual).
    // Para os demais tipos (Casa, Apartamento, Comercial), fica null.
    tipoImovelDetalhes: text("tipo_imovel_detalhes"),
    situacaoImovel: text("situacao_imovel"),
    tipoPessoa: text("tipo_pessoa"),
    valorImovelCentavos: bigint("valor_imovel_centavos", { mode: "number" }),
    // Saldo devedor — preenchido apenas quando situacaoImovel = "Financiado".
    // Para imóveis quitados, fica null. Crítico no processo de venda: define
    // viabilidade da operação e valor líquido que vai pro cliente após quitação.
    saldoDevedorCentavos: bigint("saldo_devedor_centavos", { mode: "number" }),
    valorCreditoCentavos: bigint("valor_credito_centavos", { mode: "number" }),

    // --- Endereço do imóvel (garantia) ---
    // Endereço completo do imóvel dado em garantia, capturado no passo de
    // complemento do simulador (após o lead já estar qualificado). Cidade/estado
    // do cliente seguem nas colunas de contato acima; aqui fica o imóvel. O CEP
    // permite autofill (ViaCEP) no site e localização rápida na análise.
    imovelCep: text("imovel_cep"),
    imovelLogradouro: text("imovel_logradouro"),
    imovelNumero: text("imovel_numero"),
    imovelComplemento: text("imovel_complemento"),
    imovelBairro: text("imovel_bairro"),

    // --- Cônjuge / coobrigado ---
    // Em CGI o cônjuge (casado/união estável) participa da garantia por força da
    // meação — não é dado acessório, é requisito da operação. Capturado de forma
    // OPCIONAL no complemento do simulador pra adiantar a proposta; preenchido só
    // quando estadoCivil ∈ {Casado(a), União Estável}.
    conjugeNome: text("conjuge_nome"),
    conjugeCpf: text("conjuge_cpf"),
    conjugeEmail: text("conjuge_email"),
    conjugeNascimento: date("conjuge_nascimento"),
    conjugeWhatsapp: text("conjuge_whatsapp"),
    // Composição de renda pelo cônjuge — capturado no simulador OU no portal de
    // documentos (quando o cliente pulou a última etapa). Quando true, pedimos
    // também os documentos de renda do cônjuge.
    conjugeCompoeRenda: boolean("conjuge_compoe_renda"),
    conjugeRendaCentavos: bigint("conjuge_renda_centavos", { mode: "number" }),
    conjugeOcupacao: text("conjuge_ocupacao"),

    // --- Qualificação por WhatsApp (Heloísa / IA — Objetivo 3 Fase B) ---
    // Preenchidos pela IA durante a conversa de qualificação no WhatsApp.
    qualifObjetivo: text("qualif_objetivo"),
    qualifTitularidade: text("qualif_titularidade"),
    qualifImovelRegularizado: text("qualif_imovel_regularizado"),
    qualifPendenciaJuridica: text("qualif_pendencia_juridica"),
    qualifUrgencia: text("qualif_urgencia"),
    qualifTemImovelGarantia: text("qualif_tem_imovel_garantia"), // sim | nao | nao_sei
    qualifPendenciaBloqueante: text("qualif_pendencia_bloqueante"), // sim | nao | nao_sei
    qualifWhatsappStatus: text("qualif_whatsapp_status"), // em_andamento | agendando | concluida
    qualifWhatsappEm: timestamp("qualif_whatsapp_em", { withTimezone: true }),
    // Quando a AGENDA PÚBLICA foi oferecida na tela de sucesso do simulador —
    // o proativo da Heloísa espera 15 min a partir DAQUI (não da criação do
    // lead) pra dar tempo de o cliente marcar sozinho.
    agendaOferecidaEm: timestamp("agenda_oferecida_em", { withTimezone: true }),

    // --- Cadência de follow-up (playbook executável) ---
    // Índice do passo atual na cadência do estágio (cadencia_config.passos).
    // null = sem cadência ativa (status sem cadência, ou lead antigo → faxina).
    cadenciaPasso: integer("cadencia_passo"),
    // Quando o passo atual vence (aparece na Mesa "AGORA").
    cadenciaProximaEm: timestamp("cadencia_proxima_em", { withTimezone: true }),
    cadenciaInicioEm: timestamp("cadencia_inicio_em", { withTimezone: true }),
    cadenciaAdiamentos: integer("cadencia_adiamentos").notNull().default(0),
    cadenciaPulos: integer("cadencia_pulos").notNull().default(0),

    // --- Pipeline ---
    // text livre — validado em app-layer contra status_lead_config.key.
    status: text("status").notNull().default("novo"),
    motivoDesqualificacao: text("motivo_desqualificacao"),

    // --- Atribuição ---
    consultorId: uuid("consultor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    atribuidoEm: timestamp("atribuido_em", { withTimezone: true }),
    atribuidoPor: uuid("atribuido_por").references(() => users.id, {
      onDelete: "set null",
    }),

    // --- Tracking de origem ---
    // Taxonomia hierárquica (migration 0017): channel > source > paid.
    // `origem` é legada e mantida como mirror de `source` por
    // compatibilidade durante a transição (UI/relatórios migram aos poucos).
    origem: text("origem"),
    channel: text("channel"),
    source: text("source"),
    paid: boolean("paid").default(false),
    /**
     * Multi-touch: array JSON de toques { timestamp, channel, source, paid,
     * utm_campaign, landing_page, referrer }. Permite computar first-touch,
     * last-touch e modelos lineares em report-time.
     */
    touches: jsonb("touches"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    gclid: text("gclid"),
    fbclid: text("fbclid"),
    msclkid: text("msclkid"),
    ttclid: text("ttclid"),
    wbraid: text("wbraid"),
    gbraid: text("gbraid"),
    // Click IDs adicionais (migration 0017) — captura preventiva.
    liFatId: text("li_fat_id"),   // LinkedIn Ads
    twclid: text("twclid"),       // X/Twitter Ads
    rdtCid: text("rdt_cid"),      // Reddit Ads
    sccid: text("sccid"),         // Snapchat Ads
    pinAid: text("pin_aid"),      // Pinterest Ads
    epik: text("epik"),           // Pinterest Ads (alt cookie)
    irclickid: text("irclickid"), // Impact affiliate
    cjevent: text("cjevent"),     // CJ affiliate
    rede: text("rede"),
    dispositivo: text("dispositivo"),
    palavraChave: text("palavra_chave"),
    grupoAnuncios: text("grupo_anuncios"),
    criativo: text("criativo"),
    tipoCorrespondencia: text("tipo_correspondencia"),
    referrer: text("referrer"),
    paginaEntrada: text("pagina_entrada"),

    // --- Parceria (Portal de Parceiros — parceiros.credios.com.br) ---
    // Preenchidos quando o lead chega via portal: identificam o parceiro
    // que indicou e preservam o contexto que ele escreveu sobre o cliente.
    parceiroNome: text("parceiro_nome"),
    parceiroPortalId: text("parceiro_portal_id"),
    observacoesParceiro: text("observacoes_parceiro"),

    // --- Fechamento ---
    bancoAprovador: text("banco_aprovador"),
    valorLiberadoCentavos: bigint("valor_liberado_centavos", { mode: "number" }),
    comissaoCentavos: bigint("comissao_centavos", { mode: "number" }),
    dataFechamento: date("data_fechamento"),

    // --- Detecção de valores suspeitos (migration 0025) ---
    // Lead chega com renda > R$ 1M, imóvel > R$ 30M ou crédito > R$ 10M:
    // quase sempre erro de digitação (cliente confundiu casas decimais).
    // Marcamos pra revisão manual sem rejeitar o lead. UI no detalhe do
    // lead permite aceitar (dividir os estourados por 1000) ou negar
    // (valores realmente eram altos). Resolvido = `valores_revisado_em`
    // preenchido.
    valoresSuspeitos: jsonb("valores_suspeitos"),
    valoresRevisadoEm: timestamp("valores_revisado_em", {
      withTimezone: true,
    }),
    valoresRevisadoPor: uuid("valores_revisado_por").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    /** 'mantido' (admin/gerente confirmou valores) ou 'dividido_por_1000'. */
    valoresRevisadoAcao: text("valores_revisado_acao"),

    // --- Auditoria ---
    rawPayload: jsonb("raw_payload"),
    // UUID do Notion (filename do .md exportado) — preenchido apenas em
    // leads importados via db/import-notion.ts. UNIQUE constraint pra ON
    // CONFLICT funcionar; PG default permite múltiplos NULLs.
    notionId: text("notion_id").unique(),
    ultimoContato: timestamp("ultimo_contato", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Coluna `esfriando` da spec original (CLAUDE.md §4.1) é GENERATED com NOW(),
    // que Postgres não aceita em STORED columns. Computar em queries:
    // `WHERE ultimo_contato IS NOT NULL AND ultimo_contato < NOW() - INTERVAL '3 days'`.
  },
  (table) => [
    index("idx_leads_status").on(table.status),
    index("idx_leads_consultor").on(table.consultorId),
    index("idx_leads_origem").on(table.origem),
    index("idx_leads_channel").on(table.channel),
    index("idx_leads_source").on(table.source),
    index("idx_leads_paid")
      .on(table.paid)
      .where(sql`${table.paid} = true`),
    index("idx_leads_criado").on(sql`${table.createdAt} DESC`),
    index("idx_leads_cpf")
      .on(table.cpf)
      .where(sql`${table.cpf} IS NOT NULL`),
    // Cobre fetchKpis (fechados no período), fetchReceitaMensal,
    // fetchTempoPercentis (cycle time). Filtra apenas leads fechados, que
    // é a fração pequena da tabela — index muito menor que full.
    index("idx_leads_fechado_data_fech")
      .on(sql`${table.dataFechamento} DESC`)
      .where(sql`status = 'fechado'`),
    // Cobre fetchPerformanceConsultores, fetchSlaCompliance e
    // fetchTempoPercentis — todos filtram por janela de atribuido_em.
    index("idx_leads_atribuido_em")
      .on(sql`${table.atribuidoEm} DESC`)
      .where(sql`${table.atribuidoEm} IS NOT NULL`),
  ],
);

// ============================================================================
// interacoes — timeline de eventos do lead
// ============================================================================

export const interacoes = pgTable(
  "interacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    autorId: uuid("autor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    tipo: tipoInteracaoEnum("tipo").notNull(),
    conteudo: text("conteudo"),
    metadata: jsonb("metadata"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_interacoes_lead").on(table.leadId, sql`${table.criadoEm} DESC`),
    // Subqueries de "última interação MANUAL" estão em todo dashboard
    // (esfriando, SLA 1º contato, performance consultor, percentis de tempo).
    // Index parcial só com tipos manuais derruba o custo dessas subqueries
    // correlatas em ~10x — restringe ainda mais o conjunto que o
    // idx_interacoes_lead já filtrava.
    index("idx_interacoes_manuais_lead")
      .on(table.leadId, sql`${table.criadoEm} DESC`)
      .where(
        sql`tipo NOT IN ('mudanca_status', 'mudanca_atribuicao', 'evento_sistema')`,
      ),
    // Index dedicado pra fetchTempoMedioPorStatus (janela LAG sobre eventos
    // de mudança de status).
    index("idx_interacoes_mudanca_status_lead")
      .on(table.leadId, table.criadoEm)
      .where(sql`tipo = 'mudanca_status'`),
  ],
);

// ============================================================================
// lead_portal_tokens — link mágico do portal de documentos (acesso público)
// ============================================================================
//
// Token de alta entropia gerado por lead. Guardamos SÓ o hash (sha256) — o
// valor cru vive apenas na URL enviada ao cliente. Expirável (cliente pode
// enviar aos poucos dentro da validade) e revogável.

export const leadPortalTokens = pgTable(
  "lead_portal_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revogadoEm: timestamp("revogado_em", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [index("idx_portal_tokens_lead").on(table.leadId)],
);

// ============================================================================
// lead_documentos — documentos enviados (pelo cliente via portal ou consultor)
// ============================================================================
//
// O arquivo vive no bucket privado `documentos-leads` (Supabase Storage); aqui
// fica só o metadado. `tipo` é a chave estruturada da checklist — é o que
// permite nomenclatura automática e zip organizado depois (Objetivo 4).

export const leadDocumentos = pgTable(
  "lead_documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    // Agrupamento: "titular" | "renda" | "estado_civil" | "conjuge" | "imovel".
    categoria: text("categoria").notNull(),
    // Rótulo legível no momento do upload (snapshot — sobrevive a mudança da checklist).
    rotulo: text("rotulo").notNull(),
    storagePath: text("storage_path").notNull(),
    filenameOriginal: text("filename_original"),
    mime: text("mime"),
    tamanhoBytes: bigint("tamanho_bytes", { mode: "number" }),
    // "portal" (cliente) ou "consultor".
    origem: text("origem").notNull().default("portal"),
    uploadedPor: uuid("uploaded_por").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_documentos_lead").on(table.leadId, sql`${table.createdAt} DESC`),
  ],
);

// ============================================================================
// regras_roteamento — configuráveis pelo Admin
// ============================================================================

export const regrasRoteamento = pgTable("regras_roteamento", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  prioridade: integer("prioridade").notNull().default(0),
  // Ex.: { valor_credito_min: 50000000, estado_in: ["SC", "PR"], origem_in: ["YouTube"] }
  condicoes: jsonb("condicoes").notNull(),
  acao: acaoRegraEnum("acao").notNull(),
  // Ex.: { usuario_id: "..." } ou { grupo_usuarios: [...] }
  parametros: jsonb("parametros"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// round_robin_estado — estado de distribuição justa por regra
// ============================================================================

export const roundRobinEstado = pgTable("round_robin_estado", {
  id: uuid("id").primaryKey().defaultRandom(),
  // unique() em regra_id: garante 1 linha por regra. Necessário pro UPSERT
  // (ON CONFLICT) do pickNextRoundRobin não criar 2 linhas em race condition
  // no primeiro uso da regra.
  regraId: uuid("regra_id")
    .references(() => regrasRoteamento.id, { onDelete: "cascade" })
    .unique(),
  ultimoUsuarioId: uuid("ultimo_usuario_id").references(() => users.id, {
    onDelete: "set null",
  }),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// mensagens_template — playbook de mensagens
// ============================================================================

export const mensagensTemplate = pgTable("mensagens_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  ordem: integer("ordem").notNull().default(0),
  statusAplicavel: text("status_aplicavel").array(),
  conteudo: text("conteudo").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// status_lead_config — keys/labels/ordem do funil, gerenciado pelo Admin
// ============================================================================

export const statusLeadConfig = pgTable(
  "status_lead_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Chave estável que aparece em leads.status e nas referências do código
    // (ex: 'fechado', 'novo'). Para custom statuses, snake_case sem espaço.
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    ordem: integer("ordem").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    // Terminal = "lead concluído nesse fluxo" (fechado, perdido, etc.).
    // Não recebe SLA de esfriando, não aparece em "pipeline ativo".
    eTerminal: boolean("e_terminal").notNull().default(false),
    // Sistema = key referenciada direto pelo código (modais especiais,
    // permissões etc.). Não pode ser deletada ou ter o `key` mudado;
    // só desativada e relabel.
    eSistema: boolean("e_sistema").notNull().default(false),
    cor: text("cor"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_status_config_ordem").on(table.ordem)],
);

// ============================================================================
// cadencia_config — passos da cadência de follow-up por status (Admin edita)
// ============================================================================

export const cadenciaConfig = pgTable("cadencia_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  // FK lógico pra status_lead_config.key (sem hard FK, como leads.status).
  statusKey: text("status_key").notNull().unique(),
  /** Array de passos: { titulo, deltaDias, tipo: 'mensagem'|'ligacao'|'decisao',
   *  templateId (mensagens_template.id) | null, energia | null }. */
  passos: jsonb("passos").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// simulacao_config — faixas da proposta (Avanti-style), admin-editável
// ============================================================================

export const simulacaoConfig = pgTable("simulacao_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** { pos: {taxaMinAm, taxaMaxAm}, pre: {...}, prazos, prazoDestaque,
   *  comprometimentoRendaPct, validadeDias } — ver src/lib/simulador/config.ts */
  config: jsonb("config").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// consultas_score — score de crédito por CPF (Direct Data → QUOD)
// ============================================================================

export const consultasScore = pgTable(
  "consultas_score",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** CPF consultado (só dígitos), congelado no momento da consulta. */
    cpf: text("cpf").notNull(),
    score: integer("score"),
    faixa: text("faixa"),
    fonte: text("fonte").notNull().default("directd_quod"),
    /** Resposta bruta da Direct Data, pra auditoria/debug. */
    rawPayload: jsonb("raw_payload"),
    /** null = consulta automática (sistema). */
    consultadoPor: uuid("consultado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_consultas_score_lead").on(t.leadId, t.criadoEm.desc()),
    index("idx_consultas_score_cpf").on(t.cpf, t.criadoEm.desc()),
  ],
);

// ============================================================================
// score_solicitacoes — consultor pede consulta de score, admin aprova
// ============================================================================

export const scoreSolicitacoes = pgTable(
  "score_solicitacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    solicitadoPor: uuid("solicitado_por")
      .notNull()
      .references(() => users.id),
    /** pendente | aprovada | recusada */
    status: text("status").notNull().default("pendente"),
    resolvidoPor: uuid("resolvido_por").references(() => users.id),
    resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_score_solicitacoes_lead").on(t.leadId, t.criadoEm.desc())],
);

// ============================================================================
// duplicidades_pendentes — CPFs duplicados pendentes de revisão
// ============================================================================

export const duplicidadesPendentes = pgTable("duplicidades_pendentes", {
  id: uuid("id").primaryKey().defaultRandom(),
  novoLeadId: uuid("novo_lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  leadExistenteId: uuid("lead_existente_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  cpf: text("cpf").notNull(),
  resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
  resolvidoPor: uuid("resolvido_por").references(() => users.id, {
    onDelete: "set null",
  }),
  // 'merge' | 'manter_separado' | 'descartar'
  resolucao: text("resolucao"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// sla_alertas — tracking de violações de SLA
// ============================================================================

export const slaAlertas = pgTable("sla_alertas", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  tipo: tipoSlaEnum("tipo").notNull(),
  disparadoEm: timestamp("disparado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
});

// ============================================================================
// lead_bancos — propostas/documentação enviada para bancos parceiros
// ============================================================================

export const leadBancos = pgTable(
  "lead_bancos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    banco: text("banco").notNull(),
    status: statusPropostaBancoEnum("status").notNull().default("enviado"),
    enviadoEm: timestamp("enviado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    criadoPor: uuid("criado_por").references(() => users.id, {
      onDelete: "set null",
    }),
    observacoes: text("observacoes"),
  },
  (table) => [
    index("idx_lead_bancos_lead").on(table.leadId),
    index("idx_lead_bancos_status").on(table.status),
  ],
);

// ============================================================================
// audit_log — trilha de auditoria LGPD (append-only)
// ============================================================================

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // 'lead_visualizado', 'lead_editado', 'lead_atribuido', etc.
    acao: text("acao").notNull(),
    recursoTipo: text("recurso_tipo"),
    recursoId: uuid("recurso_id"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_audit_usuario").on(table.usuarioId, sql`${table.criadoEm} DESC`),
    index("idx_audit_recurso").on(
      table.recursoTipo,
      table.recursoId,
      sql`${table.criadoEm} DESC`,
    ),
  ],
);

// ============================================================================
// webhook_idempotency — dedup de chamadas ao /api/webhooks/lead
// (CLAUDE.md §6.2 etapa 3 — janela de 60s por hash de payload).
// Usado apenas pelo backend (service_role bypassa RLS).
// Cleanup de rows antigas: TODO via cron na Fase 4.
// ============================================================================

export const webhookIdempotency = pgTable(
  "webhook_idempotency",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payloadHash: text("payload_hash").notNull().unique(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_webhook_idem_created").on(sql`${table.createdAt} DESC`),
  ],
);

// ============================================================================
// tracking_sources — catálogo canônico de fontes de tráfego (migration 0017)
// Substitui o enum ORIGENS hardcoded. Admin gerencia pela UI em
// /configuracoes/tracking. Cada source pertence a um Channel (camada estável
// alinhada com GA4) — ver src/lib/tracking/taxonomy.ts.
// ============================================================================

export const trackingSources = pgTable(
  "tracking_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull().unique(),
    channel: text("channel").notNull(),
    paid: boolean("paid").notNull().default(false),
    displayName: text("display_name").notNull(),
    color: text("color"),
    icon: text("icon"),
    ordem: integer("ordem").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    // patterns: { referrer_hosts?: string[], utm_aliases?: string[], click_ids?: string[] }
    patterns: jsonb("patterns"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_tracking_sources_channel").on(table.channel),
    index("idx_tracking_sources_ordem").on(table.ordem),
  ],
);

// ============================================================================
// tracking_source_aliases — utm_source bruto → source canônico
// PRIMARY KEY na coluna `alias` (já em lowercase) garante upsert simples.
// ============================================================================

export const trackingSourceAliases = pgTable("tracking_source_aliases", {
  alias: text("alias").primaryKey(),
  source: text("source")
    .notNull()
    .references(() => trackingSources.source, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// tracking_unknowns — quarantine de leads com origem desconhecida
// Quando classifyTouch retorna source="Unknown", a row aqui registra o
// payload bruto pra admin revisar e promover (criar source canônico + alias)
// ou descartar. Após resolução, leads ligados são reclassificados.
// ============================================================================

export const trackingUnknowns = pgTable(
  "tracking_unknowns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    rawOrigem: text("raw_origem"),
    rawReferrer: text("raw_referrer"),
    rawUtmSource: text("raw_utm_source"),
    rawUtmMedium: text("raw_utm_medium"),
    rawUtmCampaign: text("raw_utm_campaign"),
    rawClickIds: jsonb("raw_click_ids"),
    resolvedToSource: text("resolved_to_source"),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_tracking_unknowns_resolved").on(table.resolvedAt),
    index("idx_tracking_unknowns_created").on(sql`${table.createdAt} DESC`),
  ],
);

// ============================================================================
// lead_anotacoes — anotações livres editáveis sobre o cliente (migration 0020)
// ============================================================================
// Diferente de `interacoes` (imutáveis, append-only): anotações podem ser
// editadas pelo admin ou pelo consultor atribuído ao lead, e excluídas
// apenas pelo admin. Cada operação destrutiva passa por modal de confirmação
// na UI e gera entry no audit_log no servidor.
// ============================================================================

export const leadAnotacoes = pgTable(
  "lead_anotacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** Opcional — ex.: "Dados do cônjuge", "Pendência cartório". */
    titulo: text("titulo"),
    /** Texto puro, preserva quebras de linha via whitespace-pre-wrap na UI. */
    conteudo: text("conteudo").notNull(),
    autorId: uuid("autor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Preenchido apenas quando a anotação foi editada depois de criada. */
    editadoEm: timestamp("editado_em", { withTimezone: true }),
    editadoPor: uuid("editado_por").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_lead_anotacoes_lead").on(table.leadId, sql`${table.createdAt} DESC`),
  ],
);

// ============================================================================
// saved_lead_views — visualizações salvas (presets de filtro) por usuário
// ============================================================================
// Cada usuário salva combinações nomeadas de filtros + ordenação + modo
// (lista/kanban) das telas de leads, e seleciona depois por um menu. Escopo
// estritamente por usuário — não há compartilhamento entre consultores.
// `filtros` guarda os params da URL (sem `page`) como objeto chave→valor.

export const savedLeadViews = pgTable(
  "saved_lead_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    /** 'lista' | 'kanban' — a tela em que a visualização foi salva. */
    viewMode: text("view_mode").notNull().default("lista"),
    /** Params da URL (status, consultorId, sortBy, ...) sem `page`. */
    filtros: jsonb("filtros")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_saved_lead_views_user").on(
      table.userId,
      sql`${table.createdAt} DESC`,
    ),
  ],
);

// ============================================================================
// google_ads_conversions — fila/auditoria de conversões offline enviadas ao
// Google Ads (offline conversion import via GCLID). Cada linha = um evento de
// conversão por lead (idempotência via UNIQUE(lead_id, conversion_action)).
//
// Fluxo: o hook de mudança de status (src/app/api/leads/[id]/status) insere a
// linha como `pending` e tenta o upload em background (after()) via Data Manager
// API. O cron /api/cron/google-ads-retry reprocessa `pending`/`failed`. A Data
// Manager API não suporta retração; quando um lead qualificado vira
// `desqualificado`, a linha é marcada `retract_unsupported` (auditoria, sem
// chamada de API). Ver src/lib/google-ads/.
// ============================================================================

export const googleAdsConversions = pgTable(
  "google_ads_conversions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** 'qualified' | 'closed' — qual das 2 ações de conversão do Google. */
    conversionAction: text("conversion_action").notNull(),
    /** = lead_id. Chave de idempotência/retração do lado do Google Ads. */
    orderId: text("order_id").notNull(),
    gclid: text("gclid"),
    wbraid: text("wbraid"),
    gbraid: text("gbraid"),
    /** Valor da conversão em centavos (convertido p/ BRL no upload). */
    valueCents: bigint("value_cents", { mode: "number" }),
    currency: text("currency").notNull().default("BRL"),
    /** Hora do evento de conversão (mudança de status). */
    conversionAt: timestamp("conversion_at", { withTimezone: true }).notNull(),
    /** pending | uploaded | failed | retract_unsupported */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    retractedAt: timestamp("retracted_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_gads_conv_lead_action").on(
      table.leadId,
      table.conversionAction,
    ),
    index("idx_gads_conv_status").on(table.status),
  ],
);

// ============================================================================
// reunioes — reuniões agendadas pela Heloísa (SDR) na agenda do consultor
// ============================================================================
export const reunioes = pgTable(
  "reunioes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    consultorId: uuid("consultor_id").references(() => users.id),
    /** ID do evento no Google Calendar (pra remarcar/cancelar). */
    googleEventId: text("google_event_id"),
    meetLink: text("meet_link"),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fim: timestamp("fim", { withTimezone: true }).notNull(),
    /** agendada | remarcada | cancelada | realizada | no_show */
    status: text("status").notNull().default("agendada"),
    /** Lembrete de ~30 min antes já enviado? (evita duplicar no cron) */
    lembreteEnviado: boolean("lembrete_enviado").notNull().default(false),
    /** Lembrete de 15 min antes pro CONSULTOR (e-mail) já enviado? */
    lembreteConsultorEnviado: boolean("lembrete_consultor_enviado")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_reunioes_lead").on(table.leadId),
    index("idx_reunioes_consultor").on(table.consultorId, table.inicio),
  ],
);
