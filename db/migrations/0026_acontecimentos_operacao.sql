-- Adiciona os "acontecimentos da operação" ao enum tipo_interacao.
-- São trabalho de bastidor que o consultor registra na timeline (contato com
-- banco, análise de crédito solicitada, vistoria realizada), mas que NÃO são
-- contato com o cliente: não atualizam ultimo_contato, não resolvem SLA e não
-- contam no placar "contatado hoje". Classificação em
-- src/lib/leads/interacao-tipos.ts.
-- ALTER TYPE ADD VALUE roda normalmente no Supabase (PG15+) desde que o valor
-- não seja usado na mesma transação — aqui só adicionamos. IF NOT EXISTS deixa
-- a migration idempotente.

ALTER TYPE "tipo_interacao" ADD VALUE IF NOT EXISTS 'contato_banco';--> statement-breakpoint
ALTER TYPE "tipo_interacao" ADD VALUE IF NOT EXISTS 'analise_credito_solicitada';--> statement-breakpoint
ALTER TYPE "tipo_interacao" ADD VALUE IF NOT EXISTS 'vistoria_realizada';
