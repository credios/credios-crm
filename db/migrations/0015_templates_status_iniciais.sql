-- ============================================================================
-- Templates de mensagem para status iniciais — 3 variações por status.
-- ============================================================================
-- Cobre os 3 status onde o consultor ainda está nutrindo o lead antes da
-- aprovação:
--
--   aguardando_resposta  → cliente sumiu após primeiro contato, follow-up
--                          pra reaquecer ou qualificar a saída.
--   conversa_inicial      → cliente falou com a gente, ainda em dúvida,
--                          ainda não topou enviar documentação.
--   aguardando_documentacao → cliente já se comprometeu, falta enviar.
--
-- Cada template é diferenciado de verdade (ângulo, gatilho, tom) — não é
-- só troca de palavras. Todas oferecem uma "porta de saída" pro cliente
-- avisar quando perdeu interesse, pra evitar leads zumbis no funil.
--
-- Idempotente via WHERE NOT EXISTS por `nome` — rodar mais de uma vez
-- não duplica e não toca em templates editados pelo admin.
--
-- Variáveis disponíveis:
--   {{primeiro_nome}} — primeiro nome do cliente em Title Case
--   {{nome}}          — nome completo em Title Case
--   {{valor_credito}} — valor buscado formatado (R$ xx.xxx,xx)
--   {{valor_imovel}}  — valor do imóvel formatado
--   {{cidade}}, {{estado}}, {{consultor}}, {{primeiro_nome_consultor}}
-- ============================================================================

-- ============================================================================
-- AGUARDANDO RESPOSTA — cliente sumiu, follow-up antes de descartar.
-- ============================================================================

INSERT INTO mensagens_template (nome, ordem, status_aplicavel, conteudo, ativa)
SELECT
  'Aguardando resposta — Follow-up direto',
  10,
  ARRAY['aguardando_resposta']::text[],
  E'Oi, {{primeiro_nome}}! Tudo bem?\n\nVoltei aqui pra saber se ainda faz sentido pra você seguir com o crédito de {{valor_credito}} com garantia de imóvel.\n\nSe topar, posso te mandar uma simulação rápida hoje mesmo. E se você desistiu da ideia, me avisa que paro o atendimento por aqui — é melhor pros dois lados. 🙂',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM mensagens_template WHERE nome = 'Aguardando resposta — Follow-up direto'
);

INSERT INTO mensagens_template (nome, ordem, status_aplicavel, conteudo, ativa)
SELECT
  'Aguardando resposta — Argumento de benefício',
  11,
  ARRAY['aguardando_resposta']::text[],
  E'{{primeiro_nome}}, tudo certo?\n\nImagino que a vida tá corrida — só queria te lembrar que o crédito com garantia de imóvel tem taxa a partir de 1% ao mês + IPCA, com prazo de até 240 meses. Fica bem mais barato que cartão, cheque especial ou empréstimo pessoal.\n\nFaz sentido a gente conversar? Mesmo que seja só pra você entender se vale a pena pro seu caso.',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM mensagens_template WHERE nome = 'Aguardando resposta — Argumento de benefício'
);

INSERT INTO mensagens_template (nome, ordem, status_aplicavel, conteudo, ativa)
SELECT
  'Aguardando resposta — Última tentativa com saída clara',
  12,
  ARRAY['aguardando_resposta']::text[],
  E'Oi, {{primeiro_nome}}!\n\nEstou tentando te ajudar com o crédito de {{valor_credito}}, mas sem retorno fica difícil avançar.\n\nPode me dizer em uma linha como você prefere seguir?\n\n✔️ Quero continuar — me chama hoje\n💬 Me chama daqui a alguns dias\n🙅 Não tenho mais interesse\n\nQualquer resposta serve — assim eu te atendo do jeito certo (ou paro de te incomodar).',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM mensagens_template WHERE nome = 'Aguardando resposta — Última tentativa com saída clara'
);

-- ============================================================================
-- CONVERSA INICIAL — cliente engajou mas ainda em dúvida.
-- ============================================================================

INSERT INTO mensagens_template (nome, ordem, status_aplicavel, conteudo, ativa)
SELECT
  'Conversa inicial — Convite pra esclarecer dúvidas',
  13,
  ARRAY['conversa_inicial']::text[],
  E'Oi, {{primeiro_nome}}! Tudo bem?\n\nPensei aqui se ficou alguma dúvida da nossa última conversa sobre o crédito com garantia de imóvel. É comum ter receio antes de avançar — afinal, é uma decisão importante.\n\nPosso te explicar com calma como funciona a operação, qual o prazo, o que muda se o imóvel é quitado ou financiado, qualquer ponto que você quiser entender melhor. Me chama por aqui quando puder. 👋',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM mensagens_template WHERE nome = 'Conversa inicial — Convite pra esclarecer dúvidas'
);

INSERT INTO mensagens_template (nome, ordem, status_aplicavel, conteudo, ativa)
SELECT
  'Conversa inicial — Próximo passo é leve',
  14,
  ARRAY['conversa_inicial']::text[],
  E'{{primeiro_nome}}, queria te tranquilizar sobre uma coisa: o próximo passo da nossa conversa é só você me enviar a documentação básica do imóvel pra eu poder levar seu caso aos bancos parceiros — nada mais que isso.\n\nNão tem nenhum compromisso assinado, nenhuma análise de crédito disparada ainda. É um passo pra eu poder te trazer as condições reais (taxa, prazo, parcela) baseadas no seu caso, e aí você decide com tudo na mão se faz sentido seguir.',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM mensagens_template WHERE nome = 'Conversa inicial — Próximo passo é leve'
);

INSERT INTO mensagens_template (nome, ordem, status_aplicavel, conteudo, ativa)
SELECT
  'Conversa inicial — Provocando decisão',
  15,
  ARRAY['conversa_inicial']::text[],
  E'Oi, {{primeiro_nome}}!\n\nSei que crédito não é decisão de minuto. Pra eu te ajudar do jeito certo, queria entender em qual ponto você está hoje:\n\n📚 Ainda estudando a possibilidade — quero mais informação\n✅ Decidi seguir — vamos pra documentação\n⏳ Vou pensar com calma e te aviso\n❌ Já decidi que não vou seguir agora\n\nQualquer caminho é válido — me responde pra eu saber como continuar te atendendo.',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM mensagens_template WHERE nome = 'Conversa inicial — Provocando decisão'
);

-- ============================================================================
-- AGUARDANDO DOCUMENTAÇÃO — cliente comprometido, falta enviar.
-- ============================================================================

INSERT INTO mensagens_template (nome, ordem, status_aplicavel, conteudo, ativa)
SELECT
  'Aguardando documentação — Lembrete amigável',
  16,
  ARRAY['aguardando_documentacao']::text[],
  E'Oi, {{primeiro_nome}}! Tudo bem?\n\nPassando aqui pra lembrar dos documentos que combinamos pra eu poder começar a aprovação com os bancos:\n\n📄 Matrícula atualizada do imóvel (até 30 dias)\n🏠 IPTU\n🆔 RG ou CNH\n💰 Comprovante de renda dos últimos 3 meses\n💍 Certidão de estado civil\n\nPode me enviar tudo por aqui mesmo, foto ou PDF — o que for mais fácil pra você. Quanto antes chegar, mais rápido eu te trago a proposta. 📎',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM mensagens_template WHERE nome = 'Aguardando documentação — Lembrete amigável'
);

INSERT INTO mensagens_template (nome, ordem, status_aplicavel, conteudo, ativa)
SELECT
  'Aguardando documentação — Ajudando a destravar',
  17,
  ARRAY['aguardando_documentacao']::text[],
  E'{{primeiro_nome}}, oi!\n\nVi que ainda não me chegaram os documentos. Sei que reunir tudo dá um trabalho — quer que eu te ajude com algum?\n\nSe algum estiver complicado de conseguir (a matrícula tá com o cartório, alguma certidão você não sabe onde tirar), me avisa que eu te oriento. A gente consegue começar a análise com o que você tiver em mãos hoje, e o restante a gente vai juntando no caminho.',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM mensagens_template WHERE nome = 'Aguardando documentação — Ajudando a destravar'
);

INSERT INTO mensagens_template (nome, ordem, status_aplicavel, conteudo, ativa)
SELECT
  'Aguardando documentação — Acelerador com saída',
  18,
  ARRAY['aguardando_documentacao']::text[],
  E'Oi, {{primeiro_nome}}!\n\nEstou segurando seu lugar na fila de análise dos bancos parceiros, mas pra eu poder enviar e travar a melhor condição preciso da documentação.\n\nPra eu saber como seguir:\n\n🚀 Mando hoje — me espera mais um pouquinho\n📅 Mando essa semana — pode confirmar comigo na sexta?\n🤔 Surgiu uma dúvida nova — me chama pra conversar\n🛑 Mudei de ideia — pode encerrar\n\nQualquer resposta me ajuda a te atender do jeito certo.',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM mensagens_template WHERE nome = 'Aguardando documentação — Acelerador com saída'
);
