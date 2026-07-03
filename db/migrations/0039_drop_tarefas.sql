-- Aposentadoria final do sistema de tarefas push-based.
--
-- O refactor 31b4031 já tinha removido todo o app (páginas, APIs, crons); as
-- tabelas ficaram no banco "por via das dúvidas". Decisão de 2026-07-03:
-- não usamos mais — dropar. Dump dos dados (133 tarefas + 6 configs) feito
-- antes do drop. Policies, índices e triggers caem junto com as tabelas.
--
-- Sem CASCADE de propósito: se algo inesperado ainda depender delas, o drop
-- falha em vez de levar junto.

DROP TABLE IF EXISTS public.tarefas;
--> statement-breakpoint
DROP TABLE IF EXISTS public.task_config_por_status;
--> statement-breakpoint

-- Enums usados só pelas tabelas acima
DROP TYPE IF EXISTS public.status_tarefa;
--> statement-breakpoint
DROP TYPE IF EXISTS public.tipo_tarefa;
--> statement-breakpoint
DROP TYPE IF EXISTS public.acao_tarefa;
