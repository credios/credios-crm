# Auditoria de performance — Relatórios e Painel executivo

Data: 2026-10-15 · Escopo: `/relatorios` (e, pelo mesmo código, `/admin/painel-executivo`) · Estado: **implementado no branch `perf/relatorios`** — ver "Implementação" no fim

## Sintoma

Trocar um filtro — principalmente o período (30d → 90d, mês, ano) — demora vários segundos e a tela não dá sinal de que está carregando.

## Como foi medido

| Instrumento | O que mostrou |
|---|---|
| `pg_stat_statements` (produção, acumulado desde 2026-05-01) | tempo e nº de chamadas de cada consulta no banco |
| `EXPLAIN (ANALYZE, BUFFERS)` nas consultas mais pesadas, com 30, 90 e 365 dias | custo real no banco por janela de período |
| `pg_stat_user_tables`, `pg_matviews` | volume das tabelas e das views materializadas |
| Cabeçalho `x-vercel-id` | região da função (gru1) vs. banco (sa-east-1) |
| Leitura do código: página, `src/lib/reports/queries.ts`, `db.ts`, auth, filtros | quantas consultas cada troca de filtro dispara, cache, conexões |

**Não medido:** tempo no navegador (Web Vitals, aba Network) — o navegador da sessão não estava logado — e logs de duração das funções na Vercel (o login da Vercel CLI expirou). A Etapa 1 do plano instala essa medição antes de mexer em qualquer coisa.

## Diagnóstico

### O que NÃO é o problema

- **O volume de dados.** São 754 leads e ~10 mil interações. As views materializadas têm 724 e 10 linhas.
- **As consultas em si.** Com `EXPLAIN ANALYZE`, o funil de conversão roda em 3 ms (30d), 5 ms (90d) e 12 ms (365d). O tempo médio por status, a consulta mais pesada, fica em ~68 ms com 30 ou 365 dias. Pelo `pg_stat_statements`, nenhuma consulta de relatório passa de 50 ms de média.
- **A distância até o banco.** A função roda em São Paulo (`gru1`), na mesma região do banco.

Trocar 30d por 90d **não deixa o banco mais lento**. A lentidão está na forma como a página busca e entrega os dados.

### O que É o problema (por impacto)

**1. Cada troca de filtro recalcula a página inteira, quase sempre sem cache.**
Uma troca de filtro dispara de novo as 11 seções da página, cerca de 35 a 40 consultas. O cache (`unstable_cache`) expira em 5 minutos e **nunca é invalidado por evento**: não existe `revalidateTag("reports:dashboards")` em lugar nenhum. Por isso:
- todo período escolhido pela primeira vez (90d, trimestre, ano) chega frio;
- depois de 5 minutos tudo esfria de novo, mesmo sem nenhum lead novo;
- a chave do cache muda a cada hora (`bucketHour`), então os períodos que terminam em "agora" esfriam também a cada virada de hora.

**2. A tela não dá retorno enquanto espera.**
Os filtros usam `startTransition(() => router.replace(...))`, mas descartam o `isPending` (`const [, startTransition]`). O usuário clica e nada muda até a resposta chegar. Isso pesa mais na percepção de lentidão do que qualquer milissegundo de banco.

**3. Consultas demais, em vez de poucas consultas agregadas.**
- KPIs: 5 consultas no período atual e mais 5 no período de comparação. Daria para fazer 1 só, com `count(*) FILTER (WHERE …)`.
- Distribuições: 1 consulta de total e mais 6 em paralelo.
- MQL/SQL roda duas vezes (atual e comparação), mais a versão por origem.

Com até 15 conexões por instância, cerca de 40 consultas viram filas: o tempo da página é a soma de várias "ondas", não o tempo da consulta mais lenta.

**4. As views materializadas atrapalham mais do que ajudam.**
Com 754 leads, ler a tabela `leads` direto custa o mesmo que ler a view. Ainda assim, as views:
- deixam os números até 30 minutos atrasados;
- não têm `produto` nem `channel`. Qualquer filtro de produto cai em outro caminho de código (`canUseMV`), o que dobra a lógica e os casos de teste;
- custam 145 ms + 13 ms a cada 30 minutos, e cada `REFRESH` é um comando de estrutura (DDL) no banco. O `pg_stat_statements` mostra 11.687 recargas do cache de estrutura (`SELECT name FROM pg_timezone_names`, 565 ms em média, 6.600 s no total). A relação com os `REFRESH` é **provável, não confirmada**.

**5. Uma conexão nova custa caro, e acontece o tempo todo.**
- Abrir conexão com o pooler leva **~430 ms** a partir daqui (TLS + autenticação). Uma consulta numa conexão já aberta leva ~16 ms.
- Em produção, `idle_timeout: 30` fecha a conexão depois de 30 s parada. Quem volta à tela pouco depois paga a abertura de novo.
- O postgres-js busca a tabela de tipos do banco a cada conexão nova (`fetch_types` ligado por padrão). Desde maio foram **211 mil execuções** dessa busca, uma por conexão aberta, e cada uma é um ida-e-volta a mais antes da primeira consulta útil.

**6. Autenticação repetida a cada navegação.**
- O middleware chama `supabase.auth.getUser()`, uma chamada HTTP ao Supabase Auth.
- A página chama `getAppUser()`, que faz outro `getUser()` (mais uma chamada HTTP) e depois consulta `users`.
- Para admin, o layout ainda chama `mfa.listFactors()`, que faz outra chamada ao Auth.

São 2 a 3 idas ao Auth em série antes de qualquer dado de relatório começar.

**7. O banco passa o dia ocupado com o tempo real (Realtime).**
A maior carga do banco **não é o CRM**: é o Supabase Realtime lendo o log de alterações para as assinaturas `postgres_changes`. Foram 13,4 milhões + 2,5 milhões de chamadas, ~84 mil segundos de processamento desde maio — algo como meio núcleo ocupado sem parar. O sininho de notificações (`notifications-bell.tsx`) assina mudanças em `leads` em **toda página, para todo usuário logado**. Esse ruído explica a variação medida: o tempo médio por status oscilou entre 68 e 335 ms na mesma consulta.

## Plano — fase única

**Meta:** trocar qualquer filtro e ver o resultado em **< 300 ms com cache quente** (o caso normal) e **< 1 s no pior caso**. O retorno visual aparece **na hora** do clique.

As frentes abaixo são independentes e entram juntas, nesta ordem de implementação.

### Etapa 1 — Medir antes e depois (instrumentação)
- Adicionar `@vercel/speed-insights` no layout raiz (Web Vitals reais: INP do clique no filtro, LCP da página).
- Emitir o cabeçalho `Server-Timing` com o tempo de cada seção (reaproveitar o `renderSection`, que já envolve todas). O tempo de cada seção aparece na aba Network do DevTools.
- Gravar uma linha de base: `pg_stat_statements_reset()` no dia da entrega e comparação 7 dias depois.
- **Pronto quando:** dá para dizer, por seção, quanto tempo levou cada troca de filtro.

### Etapa 2 — Retorno instantâneo na tela
- Usar o `isPending` do `useTransition` nos filtros: área de relatório esmaecida, indicador no filtro e botão bloqueado contra clique duplo.
- Pôr uma `key` derivada dos filtros em cada `<Suspense>`. Assim cada seção mostra o próprio esqueleto e é substituída assim que fica pronta, em vez de a tela inteira esperar a seção mais lenta.
- Pré-carregar no hover os períodos vizinhos mais usados (`router.prefetch` de 7d / 30d / 90d / mês) quando o cache do servidor estiver quente.

### Etapa 3 — Cache que acerta sempre
- Invalidar por evento, não por relógio: chamar `revalidateTag("reports:dashboards", "max")` onde o dado muda — criação de lead (webhook e manual), mudança de status, atribuição e fechamento. Com isso o TTL pode subir de 5 min para 1 h (rede de segurança).
- Trocar `bucketHour` por chave **por dia** para os períodos que terminam em "hoje". O dado só muda quando há evento, e o evento já invalida o cache.
- Pré-aquecer o cache: depois de cada invalidação (via `after()`), e num cron de madrugada, chamar os presets (7d, 30d, 90d, mês, trimestre, ano) sem filtro extra. Assim a primeira troca de período do dia já chega quente.
- Avaliar migrar de `unstable_cache` para `"use cache"` + `cacheTag`/`cacheLife` (o padrão do Next 16). Fazer só se o build com `cacheComponents` passar sem efeitos colaterais nas outras telas; caso contrário, fica `unstable_cache` com as regras acima.

### Etapa 4 — Menos consultas, mais baratas
- **Aposentar as duas views materializadas** e ler `leads` direto. Isso remove o caminho duplicado `canUseMV`, o cron `refresh-mvs` e o atraso de 30 min, e o filtro de produto passa a funcionar igual em tudo.
- KPIs (atual + comparação) numa consulta só, com `FILTER (WHERE …)`: de 10 para 1.
- Distribuições numa consulta só (`GROUPING SETS` ou `FILTER`): de 7 para 1.
- MQL/SQL atual + comparação + por origem: de 3 para 1.
- **Meta:** de ~40 para ~12 consultas por troca de filtro, todas abaixo de 70 ms.
- De passagem: a consulta de tempo médio monta SQL por concatenação de texto (`sql.raw`). Passar para parâmetros do Drizzle, como as outras.

### Etapa 5 — Conexões e autenticação
- `db.ts`: `fetch_types: false` (o app não usa arrays de tipos customizados que dependam disso — confirmar nos testes) e `idle_timeout` de 30 s → 240 s.
- Confirmar no painel da Vercel que **Fluid compute** está ligado (instâncias reaproveitadas = conexões reaproveitadas).
- Autenticação local por JWT:
  - ligar as chaves de assinatura **assimétricas** no Supabase Auth (passo do owner, no painel);
  - trocar `getUser()` por `getClaims()` no middleware e em `getAppUser()`. `getClaims` valida o JWT localmente, sem ida ao Auth;
  - no layout, ler o nível MFA das claims (`aal`) em vez de `listFactors()` a cada navegação. `listFactors` fica só no primeiro acesso.
  - **Resultado:** de 2–3 chamadas HTTP ao Auth por navegação para zero.

### Etapa 6 — Tirar a carga do banco
- Sininho de notificações: trocar `postgres_changes` por **Broadcast**. O servidor publica "lead novo" no canal quando cria o lead (webhook e manual), e o navegador só escuta. Isso elimina a varredura contínua do log de alterações. As assinaturas de detalhe do lead (interações, anotações) podem ficar, pois só existem com a ficha aberta.
- Conferir no painel do Supabase o tamanho da instância e o gráfico de CPU antes e depois. Se a CPU cair como esperado, não há motivo para subir de plano.

### Critérios de pronto
1. Trocar o período mostra o indicador de carregando em < 100 ms (INP no Speed Insights).
2. Com cache quente, a troca completa em < 300 ms (Server-Timing).
3. Com cache frio, < 1 s.
4. Zero chamadas ao Supabase Auth por navegação em página autenticada (log do middleware).
5. Chamadas de leitura do log de alterações do Realtime caem > 80% em 7 dias (`pg_stat_statements`).
6. Os números dos relatórios batem com os de hoje, seção por seção. Fazer a comparação antes/depois num script, com o mesmo filtro e período.

### Riscos e cuidados
- **Aposentar as views:** os números precisam bater (critério 6). Hoje a view troca vazio por "Sem origem", "—" e `POOL`, e a leitura direta precisa repetir essas regras.
- **`getClaims`** depende das chaves assimétricas. Sem elas, ele cai de volta em `getUser` (sem quebrar, mas também sem ganho).
- **Permissões:** toda consulta continua no servidor. Comissão segue só para admin; o banco aprovador e o valor liberado seguem para admin e marketing (§5 do CLAUDE.md). Nenhum dado novo vai para o navegador.
- Os mesmos ajustes valem para `/admin/painel-executivo`, que usa o mesmo `queries.ts`.

### Passos que só o owner faz
1. Supabase → Auth → JWT Signing Keys: migrar para chaves assimétricas.
2. Vercel → projeto `credios-crm` → Settings → Functions: confirmar Fluid compute ligado.
3. `npx vercel login` neste computador, se quiser que os logs de duração da Vercel entrem na comparação antes/depois.

---

## Implementação (2026-10-15)

### Achado novo durante a implementação: o pooler trava com consultas empilhadas

Medido contra produção, com a configuração de produção do app (15 conexões, pooler modo transaction, porta 6543):

| Consultas em paralelo | Resultado |
|---|---|
| 15 | ok, 0,3 s |
| 40 | **travado por 10 s+** |
| 8 numa conexão só, modo session (5432) | ok, 0,3 s |

Quando as conexões acabam, o postgres-js empilha a consulta numa conexão já ocupada, e o pooler em modo transaction trava com 4 ou mais empilhadas (a opção `max_pipeline` do driver não resolve). Um relatório com cache frio dispara ~40 consultas de uma vez, e as seções ficavam presas até o timeout de 25 s. **Este era, provavelmente, o maior motivo da lentidão.**

Correção: `src/lib/db.ts` ganhou um limitador que nunca deixa mais consultas em voo do que conexões; o excedente espera numa fila do app. Com ele, o cron que aquece os 8 períodos (~20 consultas cada) leva 87–393 ms por período com cache frio e 1–3 ms com cache quente (build de produção local, contra o banco real).

### O que entrou, por etapa

1. **Instrumentação:** Speed Insights na área logada; uma linha `{"perf": "/relatorios", "secao", "ms", "status"}` por seção nos logs da Vercel (`src/components/relatorios/render-section.tsx`, compartilhado pelas duas páginas); `scripts/perf-baseline.mts` tira uma foto do `pg_stat_statements` e compara duas fotos. Linha de base gravada em `exportacoes/perf-2026-10-15.json`.
2. **Retorno imediato:** os filtros mostram o valor novo no mesmo frame (`useOptimistic`), exibem "Atualizando…" e a área esmaece (`transicao-filtros.tsx`). Cada seção é um Suspense com `key` dos filtros e aparece assim que fica pronta. Os campos de valor R$ esperam 600 ms depois da última tecla; antes, cada tecla recalculava a página inteira.
3. **Cache:** chave por dia (Brasília) em vez de por hora; TTL de 10 min, que é stale-while-revalidate; o cron `/api/cron/aquecer-relatorios` (a cada 10 min) recalcula os 8 períodos padrão e substitui o `refresh-mvs`.
4. **Menos consultas:** views materializadas fora do código (a migration 0057 as apaga); KPIs de 5 para 1 consulta; métricas de venda de 4 para 1; Distribuições de 8 para 1, agora parametrizadas e **respeitando o filtro de produto**, que antes era ignorado ali. Conferido contra produção: nos casos em que o código antigo já lia a tabela, as consultas novas devolvem exatamente os mesmos números (54 comparações). Onde o antigo lia a view, os números novos são os da tabela. Exemplo: "7 dias" mostrava 9 leads novos (a view contava dias inteiros) e agora mostra 7 (as últimas 168 h). É o mesmo critério que o filtro de produto já usava.
5. **Conexões e autenticação:** `idle_timeout` de 30 s para 240 s; `getClaims()` no middleware e no `getAppUser` (sem ida ao Supabase Auth quando as chaves forem assimétricas); no layout, o `listFactors` só roda quando a sessão diz que não há fator TOTP.
6. **Tempo real por Broadcast:** a migration 0056 cria triggers que publicam em canais privados (`crm:leads`, `crm:lead:<id>`), mais a política de quem ouve cada canal. O sininho, a lista, o kanban, a timeline e as anotações ouvem esses canais. Nenhuma assinatura `postgres_changes` sobrou. Validada contra o banco numa transação desfeita: o admin ouve tudo, o consultor só os leads dele, o marketing não ouve timeline e quem não está logado não ouve nada. De quebra, as anotações ao vivo passam a funcionar: `lead_anotacoes` nunca esteve na publicação do Realtime.

### O que ficou diferente do plano, e por quê
- **Server-Timing → log por seção.** A página faz streaming: os headers saem antes de as seções terminarem.
- **Invalidação por evento (`revalidateTag`) → cache por dia + SWR + aquecimento.** As automações (Heloísa, cadências) alteram `leads` a cada poucos minutos; invalidar a cada escrita deixaria o cache sempre frio.
- **`fetch_types: false` não entrou.** Sem a busca de tipos, colunas de array (`text[]`) podem voltar como texto cru. O ganho (uma ida ao banco por conexão nova) não paga o risco; o `idle_timeout` maior já reduz as conexões novas.
- **Prefetch no hover e migração para `"use cache"` ficaram de fora.** Com o cache quente, o ganho é pequeno, e o `cacheComponents` mexe no app inteiro.
- **MQL/SQL não foi consolidado:** já eram 3 consultas simples, uma por cartão.

### Ordem do deploy (passos do owner)
1. **Aplicar a migration 0056** (Broadcast) **antes** do deploy. Sem ela, o sininho, a lista ao vivo e a timeline ao vivo param de receber eventos (nada quebra; só deixa de ser ao vivo).
2. Deploy do branch.
3. **Depois** do deploy, aplicar a 0057 (apaga as views).
4. Supabase → Auth → JWT Signing Keys: migrar para chaves assimétricas (sem isso o `getClaims` funciona, mas sem o ganho).
5. Vercel: confirmar que o Fluid compute está ligado.
6. Uma semana depois: `node --env-file=.env.local --import tsx scripts/perf-baseline.mts --comparar exportacoes/perf-2026-10-15.json`.
