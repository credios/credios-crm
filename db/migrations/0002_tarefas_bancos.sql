DO $$ BEGIN
 CREATE TYPE "public"."status_tarefa" AS ENUM('aberta', 'concluida', 'atrasada');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."tipo_tarefa" AS ENUM('contato_diario', 'follow_up_banco');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."acao_tarefa" AS ENUM('liguei', 'enviei_whatsapp', 'recebi_resposta', 'cobrei_documentacao', 'atualizei_retorno_banco', 'atualizei_banco_parceiro', 'cliente_pediu_retorno', 'nao_consegui_contato', 'outro');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status_proposta_banco" AS ENUM('enviado', 'em_analise', 'aprovado', 'recusado', 'pendencia', 'proposta_emitida');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"consultor_id" uuid NOT NULL,
	"tipo" "tipo_tarefa" DEFAULT 'contato_diario' NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"status" "status_tarefa" DEFAULT 'aberta' NOT NULL,
	"data_referencia" date NOT NULL,
	"vence_em" timestamp with time zone NOT NULL,
	"concluida_em" timestamp with time zone,
	"concluida_por" uuid,
	"acao_conclusao" "acao_tarefa",
	"observacao_conclusao" text,
	"email_resumo_enviado_em" timestamp with time zone,
	"email_atraso_enviado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_bancos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"banco" text NOT NULL,
	"status" "status_proposta_banco" DEFAULT 'enviado' NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" uuid,
	"observacoes" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_consultor_id_users_id_fk" FOREIGN KEY ("consultor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_concluida_por_users_id_fk" FOREIGN KEY ("concluida_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_bancos" ADD CONSTRAINT "lead_bancos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_bancos" ADD CONSTRAINT "lead_bancos_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tarefas_consultor_status_data" ON "tarefas" USING btree ("consultor_id","status","data_referencia");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tarefas_lead_status" ON "tarefas" USING btree ("lead_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tarefas_vence_em" ON "tarefas" USING btree ("vence_em");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tarefas_lead_ativa_unica" ON "tarefas" ("lead_id") WHERE status IN ('aberta', 'atrasada');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tarefas_lead_dia_unica" ON "tarefas" ("lead_id","data_referencia");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lead_bancos_lead" ON "lead_bancos" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lead_bancos_status" ON "lead_bancos" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_bancos_lead_banco_unico" ON "lead_bancos" ("lead_id","banco");
