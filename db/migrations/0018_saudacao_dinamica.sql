-- Saudação dinâmica: troca prefixos "Oi, {{primeiro_nome}}",
-- "Olá, {{primeiro_nome}}", "Bom dia, {{primeiro_nome}}", "Oi! " e "Olá! "
-- por {{saudacao}} (resolvido em runtime conforme horário do consultor).
-- Lógica em src/lib/templates.ts.
-- Idempotente (regex só substitui se prefixo ainda for a forma antiga).

UPDATE "mensagens_template" SET conteudo = regexp_replace(conteudo, '^Oi, \{\{primeiro_nome\}\}', '{{saudacao}}, {{primeiro_nome}}') WHERE conteudo ~ '^Oi, \{\{primeiro_nome\}\}';
--> statement-breakpoint
UPDATE "mensagens_template" SET conteudo = regexp_replace(conteudo, '^Olá, \{\{primeiro_nome\}\}', '{{saudacao}}, {{primeiro_nome}}') WHERE conteudo ~ '^Olá, \{\{primeiro_nome\}\}';
--> statement-breakpoint
UPDATE "mensagens_template" SET conteudo = regexp_replace(conteudo, '^Bom dia, \{\{primeiro_nome\}\}', '{{saudacao}}, {{primeiro_nome}}') WHERE conteudo ~ '^Bom dia, \{\{primeiro_nome\}\}';
--> statement-breakpoint
UPDATE "mensagens_template" SET conteudo = regexp_replace(conteudo, '^Oi! ', '{{saudacao}}! ') WHERE conteudo ~ '^Oi! ';
--> statement-breakpoint
UPDATE "mensagens_template" SET conteudo = regexp_replace(conteudo, '^Olá! ', '{{saudacao}}! ') WHERE conteudo ~ '^Olá! ';
