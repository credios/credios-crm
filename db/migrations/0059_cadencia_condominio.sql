-- Cadência de CONDOMÍNIO (2026-10-20, pedido do owner): 3 mensagens diretas
-- na etapa "Novo" — o síndico já chega com intenção alta — e a decisão de
-- seguir ou encerrar no fim (padrão de toda cadência do CRM). Só dados;
-- idempotente. Templates e passos ficam editáveis em Configurações.

INSERT INTO "mensagens_template" ("nome", "ordem", "status_aplicavel", "produto", "conteudo", "ativa")
SELECT v.nome, v.ordem, v.status_aplicavel, 'CONDOMINIO', v.conteudo, true
FROM (VALUES
  ('Condomínio — 1. Apresentação da Credios', 90, ARRAY['novo'],
   '{{saudacao}}, {{sindico}}! Aqui é {{primeiro_nome_consultor}}, da Credios. Recebemos o pedido de crédito do {{nome}} e sou eu quem vai cuidar do caso. O crédito para condomínios é concedido pelo nosso próprio fundo (FIDC): a mesma equipe cuida da análise, da proposta, do apoio na assembleia e da contratação.'),
  ('Condomínio — 2. Como podemos ajudar', 91, ARRAY['novo','conversa_inicial'],
   '{{sindico}}, para já adiantar a análise: qual é a obra ou a necessidade do condomínio, e vocês já têm orçamento? Se preferir, te ligo em 10 minutos e resolvemos por telefone. Como posso ajudar?'),
  ('Condomínio — 3. Passo a passo da contratação', 92, ARRAY['novo','conversa_inicial','aguardando_resposta','aguardando_documentacao'],
   '{{sindico}}, a contratação do crédito para o {{nome}} funciona assim:
1. Conversamos sobre a necessidade e o valor.
2. Você envia convenção, ata de eleição do síndico, últimos 3 balancetes e relação de inadimplência.
3. Analisamos o condomínio e apresentamos a proposta do nosso fundo.
4. A assembleia aprova a contratação.
5. Contrato assinado, recurso liberado para a obra.
Vamos começar pelo passo 1?')
) AS v(nome, ordem, status_aplicavel, conteudo)
WHERE NOT EXISTS (
  SELECT 1 FROM "mensagens_template" t WHERE t.nome = v.nome AND t.produto = 'CONDOMINIO'
);--> statement-breakpoint

INSERT INTO "cadencia_config" ("status_key", "produto", "passos", "ativa")
SELECT 'novo', 'CONDOMINIO', jsonb_build_array(
  jsonb_build_object('titulo', 'Mensagem — apresentar a Credios', 'deltaDias', 0, 'tipo', 'mensagem',
    'templateId', (SELECT id FROM mensagens_template WHERE produto = 'CONDOMINIO' AND nome = 'Condomínio — 1. Apresentação da Credios' LIMIT 1),
    'energia', 'Síndico que pediu crédito quer resolver. Responda rápido.'),
  jsonb_build_object('titulo', 'Mensagem — como podemos ajudar', 'deltaDias', 1, 'tipo', 'mensagem',
    'templateId', (SELECT id FROM mensagens_template WHERE produto = 'CONDOMINIO' AND nome = 'Condomínio — 2. Como podemos ajudar' LIMIT 1),
    'energia', 'Uma pergunta certa abre a conversa.'),
  jsonb_build_object('titulo', 'Mensagem — passo a passo da contratação', 'deltaDias', 2, 'tipo', 'mensagem',
    'templateId', (SELECT id FROM mensagens_template WHERE produto = 'CONDOMINIO' AND nome = 'Condomínio — 3. Passo a passo da contratação' LIMIT 1),
    'energia', 'Caminho claro, decisão mais fácil.'),
  jsonb_build_object('titulo', 'Decidir: seguir de perto ou encerrar', 'deltaDias', 3, 'tipo', 'decisao',
    'templateId', NULL, 'energia', 'Pipeline limpo é foco em quem fecha.')
), true
ON CONFLICT ("status_key", "produto") DO NOTHING;
