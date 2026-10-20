-- Crédito para condomínio é concedido pelo FIDC próprio da Credios — não é
-- intermediação (correção do owner, 2026-10-20). Ajusta as mensagens 1 e 3 da
-- cadência de condomínio (0059). Só troca se o texto ainda for o original:
-- edição feita pelo admin em Configurações → Mensagens é preservada.

UPDATE "mensagens_template"
SET "conteudo" = replace("conteudo", 'A Credios estrutura crédito para condomínios: levamos a operação a financiadores parceiros, negociamos taxa e prazo e acompanhamos tudo, da documentação à assembleia e à contratação.', 'O crédito para condomínios é concedido pelo nosso próprio fundo (FIDC): a mesma equipe cuida da análise, da proposta, do apoio na assembleia e da contratação.')
WHERE "produto" = 'CONDOMINIO' AND "nome" = 'Condomínio — 1. Apresentação da Credios'
  AND position('A Credios estrutura crédito para condomínios: levamos a operação a financiadores parceiros, negociamos taxa e prazo e acompanhamos tudo, da documentação à assembleia e à contratação.' in "conteudo") > 0;--> statement-breakpoint

UPDATE "mensagens_template"
SET "conteudo" = replace("conteudo", '3. Levamos o caso aos financiadores e trazemos a proposta.', '3. Analisamos o condomínio e apresentamos a proposta do nosso fundo.')
WHERE "produto" = 'CONDOMINIO' AND "nome" = 'Condomínio — 3. Passo a passo da contratação'
  AND position('3. Levamos o caso aos financiadores e trazemos a proposta.' in "conteudo") > 0;
