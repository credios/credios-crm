-- Adiciona valor 'contato' ao enum tipo_interacao.
-- Usado quando o consultor registra contato sem especificar o canal
-- (timeline limpa — sem distinção WhatsApp enviado/recebido visível).
-- ALTER TYPE ADD VALUE precisa rodar fora de transação; drizzle-kit cuida.

ALTER TYPE "tipo_interacao" ADD VALUE IF NOT EXISTS 'contato';
