-- Cleanup das anotações antigas da tabela `interacoes`.
-- Roda depois de 0020 (que copiou os dados pra lead_anotacoes).
-- Separada em migration própria pra dar segurança de rollback caso a 0020
-- precise ser revisada — os dados ficam preservados nas duas tabelas até
-- esta migration rodar e remover da `interacoes`.

DELETE FROM "interacoes" WHERE "tipo" = 'anotacao';
