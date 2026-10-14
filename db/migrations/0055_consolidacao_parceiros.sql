-- Consolidação pós-revisão (2026-10-13). Uma migration só, toda aditiva.
-- Idempotente; aplicada em prod via pooler.

-- 1. Representante legal do parceiro PJ (vai pro contrato v4).
ALTER TABLE "parceiros" ADD COLUMN IF NOT EXISTS "representante_nome" text;--> statement-breakpoint
ALTER TABLE "parceiros" ADD COLUMN IF NOT EXISTS "representante_cpf" text;--> statement-breakpoint

-- 2. Contrato: prova mais forte.
--    dados_hash   = impressão digital dos dados mesclados (cadastro mudou → regenera o pendente)
--    hash_original = SHA-256 do PDF que o parceiro assinou
--    signatario   = retrato de quem assinou, no momento da assinatura
ALTER TABLE "parceiro_contratos" ADD COLUMN IF NOT EXISTS "dados_hash" text;--> statement-breakpoint
ALTER TABLE "parceiro_contratos" ADD COLUMN IF NOT EXISTS "hash_original" text;--> statement-breakpoint
ALTER TABLE "parceiro_contratos" ADD COLUMN IF NOT EXISTS "otp_verificado_em" timestamptz;--> statement-breakpoint
ALTER TABLE "parceiro_contratos" ADD COLUMN IF NOT EXISTS "signatario" jsonb;--> statement-breakpoint

-- 3. Comissões: vencimento, comprovante de pagamento e nota fiscal.
ALTER TABLE "parceiro_comissoes" ADD COLUMN IF NOT EXISTS "vencimento" date;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN IF NOT EXISTS "comprovante" bytea;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN IF NOT EXISTS "comprovante_nome" text;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN IF NOT EXISTS "comprovante_mime" text;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN IF NOT EXISTS "nota_fiscal" bytea;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN IF NOT EXISTS "nota_fiscal_nome" text;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN IF NOT EXISTS "nota_fiscal_mime" text;--> statement-breakpoint

-- 4. Cadências por produto. As existentes são de CGI.
ALTER TABLE "cadencia_config" ADD COLUMN IF NOT EXISTS "produto" text NOT NULL DEFAULT 'CGI';--> statement-breakpoint
DO $$
DECLARE c record;
BEGIN
  -- Remove a unicidade antiga só por status_key (o nome varia conforme a origem).
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.cadencia_config'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (status_key)'
  LOOP
    EXECUTE format('ALTER TABLE public.cadencia_config DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cadencia_status_produto" ON "cadencia_config" ("status_key", "produto");--> statement-breakpoint

-- 5. Templates iniciais de CONDOMÍNIO (o playbook vive no banco). O admin
--    edita em Configurações → Mensagens. {{nome}} = condomínio; {{sindico}} =
--    primeiro nome do síndico.
INSERT INTO "mensagens_template" ("nome", "ordem", "status_aplicavel", "produto", "conteudo", "ativa")
SELECT v.nome, v.ordem, v.status_aplicavel, 'CONDOMINIO', v.conteudo, true
FROM (VALUES
  ('Condomínio — primeiro contato', 100, ARRAY['novo','conversa_inicial'],
   '{{saudacao}}, {{sindico}}! Aqui é {{primeiro_nome_consultor}}, da Credios. Recebemos o interesse do {{nome}} em crédito para o condomínio. Posso te ligar para entender a necessidade e explicar como funciona? Leva uns 10 minutos.'),
  ('Condomínio — retomada sem resposta', 110, ARRAY['conversa_inicial','aguardando_resposta'],
   '{{saudacao}}, {{sindico}}! Tudo bem? Retomando a conversa sobre o crédito para o {{nome}}. Se fizer sentido, me diga o melhor horário e eu te ligo. Se o assunto ainda vai passar por assembleia, também consigo ajudar com o material.'),
  ('Condomínio — pedido de documentos', 120, ARRAY['aguardando_documentacao'],
   '{{sindico}}, para avançar com a análise do {{nome}} preciso de: convenção do condomínio, ata de eleição do síndico, últimos 3 balancetes, relação de inadimplência e, se já houver, a ata da assembleia que aprovou a contratação do crédito. Pode me enviar por aqui.'),
  ('Condomínio — assembleia', 130, ARRAY['conversa_inicial','aguardando_resposta','aguardando_documentacao'],
   '{{sindico}}, a contratação do crédito precisa ser aprovada em assembleia. Se ajudar, envio um resumo da operação de {{valor_credito}} para você apresentar aos condôminos e posso participar da assembleia para tirar dúvidas. Já tem data prevista?'),
  ('Condomínio — operação concluída', 140, ARRAY['fechado'],
   '{{sindico}}, o crédito do {{nome}} foi liberado. Foi um prazer conduzir essa operação com você. Qualquer necessidade daqui pra frente, é só chamar.')
) AS v(nome, ordem, status_aplicavel, conteudo)
WHERE NOT EXISTS (
  SELECT 1 FROM "mensagens_template" t WHERE t.nome = v.nome AND t.produto = 'CONDOMINIO'
);
