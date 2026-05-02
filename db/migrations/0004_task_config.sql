-- ============================================================================
-- C1: Configuração de tarefas por status do funil.
-- ============================================================================
-- Antes: generateDailyTasks() tinha hardcoded 1 tarefa diária por lead ativo,
--        com título e descrição switch-case por status.
-- Depois: tabela `task_config_por_status` permite admin configurar:
--   - se status gera tarefa (`ativo`)
--   - título e descrição customizáveis
--   - frequência (1=diária, 7=semanal, etc.)
-- generateDailyTasks() respeita essas configs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "task_config_por_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status_key" text NOT NULL UNIQUE,
  "ativo" boolean NOT NULL DEFAULT true,
  "titulo" text NOT NULL DEFAULT 'Fazer acompanhamento do lead',
  "descricao" text,
  -- Dias entre tarefas. 1 = diária; 7 = semanal; 14 = quinzenal.
  -- CHECK [1, 30] pra impedir valores absurdos.
  "frequencia_dias" integer NOT NULL DEFAULT 1 CHECK ("frequencia_dias" >= 1 AND "frequencia_dias" <= 30),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Seed dos 6 não-terminais (os que hoje recebem tarefas em service.ts).
-- Terminais (fechado/perdido/desqualificado/sem_resposta) NÃO recebem
-- tarefa por default — e_terminal=true em status_lead_config + ausência
-- aqui dá double-check.
INSERT INTO "task_config_por_status" ("status_key", "ativo", "titulo", "descricao", "frequencia_dias") VALUES
  ('novo', true, 'Entrar em contato com o lead',
   'Lead recém-chegado: ligar/whatsapp em até 30 minutos pro melhor approach.', 1),
  ('conversa_inicial', true, 'Fazer follow-up e avançar qualificação',
   'Lead já respondeu uma vez. Avançar pra qualificar imóvel, valor, urgência.', 1),
  ('aguardando_resposta', true, 'Retomar contato com o lead',
   'Você enviou mensagem mas não recebeu resposta. Tentar canal alternativo.', 1),
  ('aguardando_documentacao', true, 'Cobrar documentação pendente',
   'Lead se comprometeu a enviar docs. Cobrar com gentileza, oferecer ajuda.', 1),
  ('documentacao_enviada', true, 'Acompanhar retorno dos bancos',
   'Docs estão com bancos parceiros. Atualizar lead sobre prazos e status.', 2),
  ('em_negociacao', true, 'Atualizar negociação e próximos passos',
   'Negociação ativa. Manter cliente informado, alinhar contrato e fechamento.', 1)
ON CONFLICT ("status_key") DO NOTHING;
