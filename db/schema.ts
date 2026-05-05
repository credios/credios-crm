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

export const statusTarefaEnum = pgEnum("status_tarefa", [
  "aberta",
  "concluida",
  "atrasada",
]);

export const tipoTarefaEnum = pgEnum("tipo_tarefa", [
  "contato_diario",
  "follow_up_banco",
]);

export const acaoTarefaEnum = pgEnum("acao_tarefa", [
  "liguei",
  "enviei_whatsapp",
  "recebi_resposta",
  "cobrei_documentacao",
  "atualizei_retorno_banco",
  "atualizei_banco_parceiro",
  "cliente_pediu_retorno",
  "nao_consegui_contato",
  "outro",
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
    origem: text("origem"),
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
// tarefas — follow-up diário por lead ativo
// ============================================================================

export const tarefas = pgTable(
  "tarefas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    consultorId: uuid("consultor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tipo: tipoTarefaEnum("tipo").notNull().default("contato_diario"),
    titulo: text("titulo").notNull(),
    descricao: text("descricao"),
    status: statusTarefaEnum("status").notNull().default("aberta"),
    dataReferencia: date("data_referencia").notNull(),
    venceEm: timestamp("vence_em", { withTimezone: true }).notNull(),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
    concluidaPor: uuid("concluida_por").references(() => users.id, {
      onDelete: "set null",
    }),
    acaoConclusao: acaoTarefaEnum("acao_conclusao"),
    observacaoConclusao: text("observacao_conclusao"),
    emailResumoEnviadoEm: timestamp("email_resumo_enviado_em", {
      withTimezone: true,
    }),
    emailAtrasoEnviadoEm: timestamp("email_atraso_enviado_em", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_tarefas_consultor_status_data").on(
      table.consultorId,
      table.status,
      table.dataReferencia,
    ),
    index("idx_tarefas_lead_status").on(table.leadId, table.status),
    index("idx_tarefas_vence_em").on(table.venceEm),
  ],
);

// ============================================================================
// task_config_por_status — configura quais tarefas o cron diário gera por status
// ============================================================================
// Substitui o switch-case hardcoded em src/lib/tasks/service.ts. Admin edita
// pela UI: título, descrição, frequência (em dias), ou desativa pra parar
// de gerar tarefas pra leads naquele status. Status sem row aqui também não
// gera tarefa (default: ativo=false implícito).

export const taskConfigPorStatus = pgTable("task_config_por_status", {
  id: uuid("id").primaryKey().defaultRandom(),
  // FK lógico pra status_lead_config.key — sem hard FK pra tolerar custom
  // statuses criadas/desativadas sem cascatear pro cron.
  statusKey: text("status_key").notNull().unique(),
  ativo: boolean("ativo").notNull().default(true),
  titulo: text("titulo").notNull().default("Fazer acompanhamento do lead"),
  descricao: text("descricao"),
  // 1 = diária; 7 = semanal; 14 = quinzenal. CHECK no DB ([1,30]).
  frequenciaDias: integer("frequencia_dias").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
