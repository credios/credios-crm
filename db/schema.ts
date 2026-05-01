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

export const statusLeadEnum = pgEnum("status_lead", [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
  "fechado",
  "perdido",
  "sem_resposta",
  "desqualificado",
]);

export const tipoInteracaoEnum = pgEnum("tipo_interacao", [
  "ligacao",
  "whatsapp_enviado",
  "whatsapp_recebido",
  "email",
  "reuniao",
  "anotacao",
  "mudanca_status",
  "mudanca_atribuicao",
  "documento_recebido",
  "evento_sistema",
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
    situacaoImovel: text("situacao_imovel"),
    tipoPessoa: text("tipo_pessoa"),
    valorImovelCentavos: bigint("valor_imovel_centavos", { mode: "number" }),
    valorCreditoCentavos: bigint("valor_credito_centavos", { mode: "number" }),

    // --- Pipeline ---
    status: statusLeadEnum("status").notNull().default("novo"),
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
    origem: text("origem"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    gclid: text("gclid"),
    rede: text("rede"),
    dispositivo: text("dispositivo"),
    palavraChave: text("palavra_chave"),
    grupoAnuncios: text("grupo_anuncios"),
    criativo: text("criativo"),
    tipoCorrespondencia: text("tipo_correspondencia"),
    referrer: text("referrer"),
    paginaEntrada: text("pagina_entrada"),

    // --- Fechamento ---
    bancoAprovador: text("banco_aprovador"),
    valorLiberadoCentavos: bigint("valor_liberado_centavos", { mode: "number" }),
    comissaoCentavos: bigint("comissao_centavos", { mode: "number" }),
    dataFechamento: date("data_fechamento"),

    // --- Auditoria ---
    rawPayload: jsonb("raw_payload"),
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
    index("idx_leads_criado").on(sql`${table.createdAt} DESC`),
    index("idx_leads_cpf")
      .on(table.cpf)
      .where(sql`${table.cpf} IS NOT NULL`),
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
  regraId: uuid("regra_id").references(() => regrasRoteamento.id, {
    onDelete: "cascade",
  }),
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
  statusAplicavel: statusLeadEnum("status_aplicavel").array(),
  conteudo: text("conteudo").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
