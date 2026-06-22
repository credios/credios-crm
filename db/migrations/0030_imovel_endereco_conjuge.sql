-- Endereço do imóvel (garantia) + dados do cônjuge/coobrigado.
--
-- Capturados de forma OPCIONAL no passo de complemento do simulador do site,
-- depois que o lead já está qualificado. São campos de primeira classe (e não
-- texto livre em anotações) porque entram direto na montagem da proposta:
--   • endereço completo do imóvel dado em garantia (cidade/estado do cliente
--     seguem nas colunas de contato; aqui fica o imóvel). O CEP permite autofill
--     (ViaCEP) no site e localização rápida na análise.
--   • cônjuge: em CGI, casado(a)/união estável participa da garantia por força
--     da meação — requisito da operação, não dado acessório. CPF/WhatsApp são
--     normalizados server-side (dígitos / E.164), como os do titular.
--
-- Todas nullable: leads antigos e quem pula o complemento ficam com NULL.
-- IF NOT EXISTS deixa a migration idempotente.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "imovel_cep" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "imovel_logradouro" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "imovel_numero" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "imovel_complemento" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "imovel_bairro" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conjuge_nome" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conjuge_cpf" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conjuge_email" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conjuge_nascimento" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conjuge_whatsapp" text;
