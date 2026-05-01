CREATE TYPE "public"."acao_regra" AS ENUM('atribuir_usuario', 'round_robin_grupo', 'pool_nao_atribuido');--> statement-breakpoint
CREATE TYPE "public"."perfil" AS ENUM('admin', 'gerente', 'consultor', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."status_lead" AS ENUM('novo', 'conversa_inicial', 'aguardando_resposta', 'aguardando_documentacao', 'documentacao_enviada', 'em_negociacao', 'fechado', 'perdido', 'sem_resposta', 'desqualificado');--> statement-breakpoint
CREATE TYPE "public"."tipo_interacao" AS ENUM('ligacao', 'whatsapp_enviado', 'whatsapp_recebido', 'email', 'reuniao', 'anotacao', 'mudanca_status', 'mudanca_atribuicao', 'documento_recebido', 'evento_sistema');--> statement-breakpoint
CREATE TYPE "public"."tipo_sla" AS ENUM('primeiro_contato_atrasado', 'lead_esfriando');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"acao" text NOT NULL,
	"recurso_tipo" text,
	"recurso_id" uuid,
	"metadata" jsonb,
	"ip" text,
	"user_agent" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicidades_pendentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"novo_lead_id" uuid NOT NULL,
	"lead_existente_id" uuid NOT NULL,
	"cpf" text NOT NULL,
	"resolvido_em" timestamp with time zone,
	"resolvido_por" uuid,
	"resolucao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"autor_id" uuid,
	"tipo" "tipo_interacao" NOT NULL,
	"conteudo" text,
	"metadata" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"cpf" text,
	"estado_civil" text,
	"ocupacao" text,
	"renda_mensal_centavos" bigint,
	"whatsapp" text,
	"email" text,
	"cidade" text,
	"estado" text,
	"produto" text DEFAULT 'CGI' NOT NULL,
	"objetivo_credito" text,
	"tipo_imovel" text,
	"situacao_imovel" text,
	"tipo_pessoa" text,
	"valor_imovel_centavos" bigint,
	"valor_credito_centavos" bigint,
	"status" "status_lead" DEFAULT 'novo' NOT NULL,
	"motivo_desqualificacao" text,
	"consultor_id" uuid,
	"atribuido_em" timestamp with time zone,
	"atribuido_por" uuid,
	"origem" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"gclid" text,
	"rede" text,
	"dispositivo" text,
	"palavra_chave" text,
	"grupo_anuncios" text,
	"criativo" text,
	"tipo_correspondencia" text,
	"referrer" text,
	"pagina_entrada" text,
	"banco_aprovador" text,
	"valor_liberado_centavos" bigint,
	"comissao_centavos" bigint,
	"data_fechamento" date,
	"raw_payload" jsonb,
	"ultimo_contato" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "mensagens_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"status_aplicavel" "status_lead"[],
	"conteudo" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras_roteamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"prioridade" integer DEFAULT 0 NOT NULL,
	"condicoes" jsonb NOT NULL,
	"acao" "acao_regra" NOT NULL,
	"parametros" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_robin_estado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regra_id" uuid,
	"ultimo_usuario_id" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_alertas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"tipo" "tipo_sla" NOT NULL,
	"disparado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"perfil" "perfil" NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"whatsapp" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicidades_pendentes" ADD CONSTRAINT "duplicidades_pendentes_novo_lead_id_leads_id_fk" FOREIGN KEY ("novo_lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicidades_pendentes" ADD CONSTRAINT "duplicidades_pendentes_lead_existente_id_leads_id_fk" FOREIGN KEY ("lead_existente_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicidades_pendentes" ADD CONSTRAINT "duplicidades_pendentes_resolvido_por_users_id_fk" FOREIGN KEY ("resolvido_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_autor_id_users_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_consultor_id_users_id_fk" FOREIGN KEY ("consultor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_atribuido_por_users_id_fk" FOREIGN KEY ("atribuido_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_robin_estado" ADD CONSTRAINT "round_robin_estado_regra_id_regras_roteamento_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_roteamento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_robin_estado" ADD CONSTRAINT "round_robin_estado_ultimo_usuario_id_users_id_fk" FOREIGN KEY ("ultimo_usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_alertas" ADD CONSTRAINT "sla_alertas_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_usuario" ON "audit_log" USING btree ("usuario_id","criado_em" DESC);--> statement-breakpoint
CREATE INDEX "idx_audit_recurso" ON "audit_log" USING btree ("recurso_tipo","recurso_id","criado_em" DESC);--> statement-breakpoint
CREATE INDEX "idx_interacoes_lead" ON "interacoes" USING btree ("lead_id","criado_em" DESC);--> statement-breakpoint
CREATE INDEX "idx_leads_status" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_leads_consultor" ON "leads" USING btree ("consultor_id");--> statement-breakpoint
CREATE INDEX "idx_leads_origem" ON "leads" USING btree ("origem");--> statement-breakpoint
CREATE INDEX "idx_leads_criado" ON "leads" USING btree ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_leads_cpf" ON "leads" USING btree ("cpf") WHERE "leads"."cpf" IS NOT NULL;