-- Novo status de funil "Reunião agendada" — entra logo após "Conversa inicial"
-- (ordem 35, entre conversa_inicial=30 e aguardando_documentacao=40). Setado
-- automaticamente quando a Heloísa (SDR) agenda a reunião do lead.
-- Idempotente: já aplicado em prod via pooler; este arquivo é o registro p/ fresh setup.

INSERT INTO "status_lead_config" ("key", "label", "ordem", "ativo", "e_terminal", "e_sistema")
VALUES ('reuniao_agendada', 'Reunião agendada', 35, true, false, true)
ON CONFLICT ("key") DO UPDATE
  SET "label" = excluded."label",
      "ordem" = excluded."ordem",
      "ativo" = true,
      "e_sistema" = true;
