# Arquitetura — CRM Credios

Retrato de como o CRM está configurado e arquitetado hoje (atualizado em
2026-10-20). O contrato vinculante com o owner continua sendo o
[`CLAUDE.md`](../CLAUDE.md); este documento explica **como as peças se
encaixam**. Detalhes de áreas específicas: [`WHATSAPP.md`](WHATSAPP.md)
(Heloísa), [`GOOGLE_ADS_OFFLINE_CONVERSIONS.md`](GOOGLE_ADS_OFFLINE_CONVERSIONS.md),
[`METRICAS.md`](METRICAS.md), [`RUNBOOK.md`](RUNBOOK.md).

---

## 1. Visão geral

A Credios origina crédito e usa o CRM para receber, distribuir, atender e fechar
operações. Um único app Next.js serve três públicos:

| Público | Onde | Identidade |
|---|---|---|
| Equipe Credios (admin, gerente, consultor, marketing) | `crm.credios.com.br` | Supabase Auth (Google ou e-mail/senha; 2FA obrigatório pro admin) |
| Parceiros indicadores | `parceiros.credios.com.br` → `/portal-parceiro/*` | Identidade própria do portal (nunca é usuário do CRM) |
| Clientes finais | links por token: `/portal/[token]` (documentos), `/vip/[token]`, `/agendar/[token]` | Token assinado, sem login |

Entradas de leads: site (webhook), cadastro manual, portal do parceiro.
Saídas: WhatsApp (Meta Cloud API), e-mail (Resend), Google Calendar (Meet),
conversões de mídia (Google Ads / Meta CAPI).

## 2. Stack e infraestrutura

| Camada | Escolha |
|---|---|
| App | Next.js 16 (App Router, RSC), TypeScript strict, Tailwind 4, shadcn/ui (`base-nova`) |
| Banco | Postgres no Supabase, acessado pelo **Drizzle** como owner (`src/lib/db.ts`) |
| Auth | Supabase Auth + MFA TOTP; `src/proxy.ts` (o "middleware" do Next 16) protege as rotas |
| E-mail | Resend (`src/lib/notifications/`, `src/lib/portal-parceiro/email.ts`) |
| PDF | Proposta CGI: HTML + imprimir do navegador. Contrato de parceria e simulação de condomínio: `pdf-lib` no servidor |
| Deploy | Vercel, a partir da `main`. Versão no ar: `/api/version` |
| Testes | Vitest (`tests/`), unitários e com dublês de banco |

**Conexão com o banco:** produção e scripts usam o **pooler IPv4**
(`aws-1-sa-east-1.pooler.supabase.com:6543`) — o host direto do Supabase é
IPv6-only e a Vercel não alcança. `db.ts` tem um limitador de consultas em
paralelo porque o pooler trava com pipelining excessivo.

**Crons (Vercel, `vercel.json`):**

| Rota | Frequência | O que faz |
|---|---|---|
| `/api/cron/sla-check` | 5 min | Alerta de 1º contato atrasado (30 min em horário comercial) |
| `/api/cron/proativo-whatsapp` | 5 min | Heloísa inicia conversa com lead CGI elegível |
| `/api/cron/lembrete-reuniao` | 10 min | Lembrete ao cliente (~30 min antes) e ao consultor (~15 min) — só CGI |
| `/api/cron/google-ads-retry` | 15 min | Reenvia conversões offline que falharam |
| `/api/cron/aquecer-relatorios` | 10 min | Mantém o cache dos relatórios quente |
| `/api/cron/whatsapp-health` | 2 h | Saúde do WhatsApp (entregas, falhas) |
| `/api/cron/sdr-watchdog` | 1 h | Vigia o SDR da Heloísa |
| `/api/cron/cadencia-gc` | diário | Decisão de fim de cadência ignorada 7+ dias → lead perdido + e-mail ao consultor |

## 3. Perfis e permissões

Fonte: `src/lib/auth/permissions.ts` e `src/lib/auth/mascaramento.ts`
(CLAUDE.md §5).

- **admin** — tudo: regras, usuários, audit, comissões, fechar/reabrir lead.
- **gerente** — vê e edita todos os leads, atribui; não configura nem vê comissão.
- **consultor** — só os leads atribuídos a ele; vê os parceiros que atende (sem PIX nem comissões).
- **marketing** — vê todos os leads com PII e score (mascaramento revogado em 2026-08-11), mas não as telas operacionais (timeline, WhatsApp, documentos, negociação, proposta).
- **Receita:** `comissao_centavos` e comissões de parceiro só admin; banco aprovador e valor liberado, admin e marketing; `raw_payload`, só admin.

RLS: **toda tabela tem RLS ligada**. O app passa por cima como owner; RLS
existe pra fechar a Data API do Supabase (anon key está no bundle). Tabelas só
de backend = RLS sem policy (nega tudo). Ver `db/policies.sql`.

## 4. Produtos

Fonte única: `src/lib/produtos.ts`. `leads.produto` ∈ `CGI` | `CONDOMINIO` |
`FINANCIAMENTO` (CHECK na migration 0048).

| Produto | Situação | Particularidades |
|---|---|---|
| **CGI** (crédito com garantia de imóvel) | Produto principal | Todo o funil automatizado de pessoa física |
| **CONDOMINIO** (crédito para condomínios) | Ativo desde 2026-10-13 | Atendimento pelo consultor; dados próprios em `lead_condominio`; comissão automática de 3% pro parceiro |
| **FINANCIAMENTO** | Só aceito (o portal antigo enviava) | Sem fluxo próprio |

**Regra central (CLAUDE.md §14):** as automações do funil PF rodam **só para
CGI**. Dois helpers decidem:

- `ehCgi(lead)` — consultas internas e fluxos do funil PF: score, cadastro PF,
  proposta em faixa, links de agenda e de portal de documentos, conversões de mídia.
- `aceitaContatoAutomatizado(lead)` — tudo que **fala com o cliente sozinho**
  (Heloísa, proativo, e-mail de desqualificação, lembrete de reunião, convite
  do portal de documentos): **CGI e não indicado por parceiro**. Cliente de
  parceiro é atendido só pelo consultor.

Toda automação nova precisa decidir explicitamente qual dos dois vale.

### 4.1 Condomínio no CRM

- **Modelo:** o lead continua em `leads` (status, atribuição, timeline,
  cadência). Em `leads`: `nome` = condomínio, `whatsapp`/`email` = síndico,
  `objetivo_credito` = finalidade (lista em `src/lib/condominio/constants.ts`),
  `tipo_pessoa` = Pessoa Jurídica. A tabela-irmã 1:1 `lead_condominio` guarda
  CNPJ, endereço, síndico, administradora, unidades, arrecadação,
  inadimplência (pontos-base), fundo de reserva, prazo desejado e assembleia.
- **Duplicidade:** por CNPJ (webhook, cadastro manual, edição), registrada em
  `duplicidades_pendentes` sem bloquear. CNPJ alfanumérico aceito — usar
  `limparDocumento()` / `isValidCnpj()`.
- **Finalidade vinda do site:** normalizada pra lista do CRM; texto fora da
  lista vira "Outro" e o original vai pra `finalidade_detalhes`.
- **Atendimento:** sem Heloísa, sem reunião automática, sem lembretes ao
  síndico. Cadência própria na etapa **Novo** (3 mensagens + decisão; ver §5.4).
  Templates com `{{sindico}}` (primeiro nome do síndico) em Configurações → Mensagens.
- **Fechamento:** "valor líquido contratado" e "data de assinatura do contrato
  de crédito" (`data_fechamento`). Lead de parceiro → comissão de 3% nasce
  `a_pagar`, vencimento = data + 10 dias corridos. Reabrir cancela a não paga.
- **Formulários:** `/leads/novo?produto=CONDOMINIO`, bloco `condominio` no
  webhook, indicação pelo portal do parceiro.

## 5. Leads

### 5.1 Entrada

1. **Webhook do site** — `POST /api/webhooks/lead` (`x-webhook-secret`).
   Valida (Zod), garante idempotência, classifica a origem (tracking
   canônico: channel × source, `src/lib/tracking/`), detecta duplicidade
   (CPF / CNPJ), roteia, grava `raw_payload` e dispara as automações do produto.
   **Fluxo em 2 etapas:** o site cria um lead parcial na 1ª etapa e reenvia
   com `lead_id` na 2ª — o lead é **enriquecido**, não duplicado.
2. **Cadastro manual** — `/leads/novo` (admin, gerente, consultor).
3. **Portal do parceiro** — indicação (§6.2); `parceiro_id` vem sempre da sessão.

Ao nascer em "Novo", o lead entra na cadência dessa etapa se o produto tiver
uma (hoje, só condomínio).

### 5.2 Roteamento

`src/lib/routing/engine.ts`: regras priorizadas editadas pelo admin em
`/configuracoes/roteamento` (valor, UF, origem, tipo de imóvel, horário
comercial, `produto_in`). Ações: atribuir a um usuário, round-robin num grupo
ou deixar no pool. Nenhuma regra bateu → pool não atribuído.

### 5.3 Status

Configuráveis pelo admin (`/configuracoes/status`). Os do sistema:
`novo` → `conversa_inicial` → `reuniao_agendada` → `aguardando_resposta` →
`aguardando_documentacao` → `documentacao_enviada` → `em_negociacao` →
`fechado` | `perdido` | `desqualificado`.

- Toda mudança vira evento na timeline (`interacoes`).
- `fechado` exige banco, valor, comissão e data; **fechar/reabrir é só admin**.
- `perdido`/`desqualificado` exigem motivo. Desqualificar CGI direto avisa o
  cliente (WhatsApp na janela de 24h + e-mail); demais, não.
- Reuniões futuras são canceladas ao encerrar.

### 5.4 Cadências e Minha Mesa (playbook executável)

- **Cadência** = passos por **(status, produto)** em `cadencia_config`
  (`/configuracoes/cadencias`): mensagem (template pronto), ligação ou decisão
  (seguir de perto / perdido / desqualificado). Produto sem cadência não herda a
  do CGI. Mudança de status reinicia; interação real empurra o próximo passo.
- **Minha Mesa** (`/minha-mesa`): fila "fazer agora" com 1 card por lead
  (o motivo mais urgente vence) — reunião sem desfecho, SLA estourado,
  documentos novos, passo de cadência, novo do dia, negociação parada. Filtro
  por produto.
- **Cadências atuais:** CGI em `conversa_inicial`, `aguardando_resposta` e
  `aguardando_documentacao`; **Condomínio em `novo`**: apresentação da Credios
  (dia 0) → como podemos ajudar (+1) → passo a passo da contratação (+2) →
  decisão (+3).
- **Faxina / auto-perdido:** decisão ignorada 7+ dias → perdido automático,
  com e-mail ao consultor (reversível).

### 5.5 SLA e esfriamento

Horário comercial: 08–18h BRT, seg–sex, sem feriados nacionais. Lead atribuído
em "Novo" sem contato manual há 30 min úteis → `sla_alertas`
(`primeiro_contato_atrasado`), badge e aviso ao admin. Qualquer interação
resolve. `esfriando` = sem contato há 3+ dias (coluna calculada).

### 5.6 Automações do funil CGI

| Automação | Onde | Resumo |
|---|---|---|
| Heloísa (IA no WhatsApp) | `src/lib/whatsapp/` | Atende reativo e proativo, qualifica e passa ao consultor; cede a vez quando o humano assume |
| SDR / agendamento | `src/lib/sdr/` | Qualifica e marca reunião no Meet com o consultor certo por valor |
| Agenda pública | `/agendar/[token]`, `src/lib/agenda/` | Lead pré-qualificado marca a conversa direto do site |
| Score QUOD / cadastro PF | `src/lib/score/` | Consulta paga; manual só admin, automática ao agendar |
| Portal de documentos | `/portal/[token]`, `/vip/[token]` | Cliente envia documentos pelo checklist |
| Proposta em faixa | `src/lib/simulador/faixa.ts` | PDF de 1 clique; faixas em `/configuracoes/simulacao` |
| Conversões de mídia | `src/lib/google-ads/`, `src/lib/capi/` | Conversões offline no Google Ads e Meta CAPI por etapa |

## 6. Parceiros

### 6.1 No CRM (`/parceiros`)

- Parceiro é **entidade separada** de leads e de usuários (`parceiros`), com
  pipeline de relacionamento próprio (lista, sem kanban) e histórico
  (`parceiro_interacoes`).
- **Admin** cadastra e gerencia: produtos habilitados
  (`produtos_habilitados` — o lead só aceita parceiro habilitado no produto),
  chave PIX, comissão padrão opcional, representante legal (PJ), acesso ao
  portal (liberar/suspender), contratos e contra-assinatura. **Consultor** vê
  os parceiros que atende.
- **Comissões** (`parceiro_comissoes`, só admin): uma por operação;
  status prevista → a_pagar → paga | cancelada; comprovante e nota fiscal.
  CGI é caso a caso (`/parceiros/comissoes` lista fechadas sem comissão);
  condomínio, 3% automático no fechamento.
- **Convite em lote:** convida quem tem contrato assinado e ainda não tem login.

### 6.2 Portal do parceiro (`/portal-parceiro/*`)

Código em `src/app/portal-parceiro/`, `src/app/api/portal-parceiro/` e
`src/lib/portal-parceiro/`. No host `parceiros.credios.com.br` só o portal
existe (`src/proxy.ts` + `host.ts`) e os endereços do portal antigo redirecionam.

- **Identidade própria:** `parceiro_usuarios` + `parceiro_sessoes`. Senha
  scrypt, cookie opaco `cp_sessao` com hash no banco (revogável), convite e
  redefinição por token de uso único, bloqueio de 15 min após 5 falhas.
  **Parceiro nunca é linha em `users` nem em `auth.users`.** Toda leitura
  filtra pelo `parceiro_id` da sessão; rotas que mudam estado checam Origin.
- **Contrato de parceria** (`contrato/`): modelo versionado em código
  (`modelo.ts`, vigente **v4**, cobre CGI e condomínio). Fluxo: ler → código
  de 6 dígitos por e-mail → assinar → admin contra-assina → PDF final com
  manifesto e hash, enviado às duas partes. Verificação pública em
  `/portal-parceiro/verificar/[codigo]`. A área logada exige contrato
  assinado que cubra os produtos habilitados. Nunca editar o texto de uma
  versão assinada — mudou cláusula, nova versão.
- **Indicação de cliente:** CGI (com pré-qualificação) ou condomínio (CNPJ,
  síndico, finalidade), só nos produtos habilitados. Lead + dados do
  condomínio gravados numa transação.
- **Acompanhamento:** etapas públicas (`status.ts`: recebida, em análise,
  documentação, análise de crédito, liberada, não aprovada, cancelada) —
  **nunca** status interno, consultor, banco ou anotações. E-mail ao parceiro
  só em `em_credito`, `liberada` e `nao_aprovada`.
- **Comissões:** o parceiro vê as próprias, envia nota fiscal e edita a chave
  PIX (com senha).
- **Simulação de condomínio** (`/portal-parceiro/simulacoes`, só habilitados
  em condomínio): o parceiro informa condomínio, CNPJ, valor e,
  opcionalmente, unidades e finalidade, e baixa um PDF com o nome dele. Taxa
  **por prazo**, validade, IOF e faixa de valor vêm de
  `/configuracoes/simulacao-condominio`. Cada simulação fica em
  `parceiro_simulacoes` com as taxas congeladas; "Indicar" pré-preenche a
  indicação; a geração aparece no histórico da ficha do parceiro.
- **Termos e privacidade:** `/portal-parceiro/termos` e `/privacidade`.

Textos jurídicos (contrato, termos, privacidade) foram redigidos sem revisão
de advogado.

## 7. Relatórios

- `/relatorios` — KPIs do mês, volume por origem, funil histórico, tempo por
  etapa, desempenho por consultor, receita; filtros de período, origem,
  consultor e produto.
- `/relatorios/google-ads` — auditoria dos leads do Google com export CSV.
- Painel executivo (`/admin/painel-executivo`) e saúde por consultor (`/admin/consultores`,
  `/meu-desempenho`).
- Lê `leads` direto (as views materializadas saíram na 0057), com cache
  aquecido por cron e atualização em tempo real (Supabase Realtime).

## 8. Configurações (admin)

`/configuracoes`: usuários, regras de roteamento, templates de mensagem (por
produto), cadências (por status e produto), simulação CGI (faixas), simulação
de condomínio (taxa por prazo), status do funil, tracking de origem,
conversões Google Ads, saúde do WhatsApp. Tudo editável sem deploy; caches
de 5 min invalidados no salvar.

## 9. Auditoria e LGPD

`audit_log` registra login, visualização e edição de lead, atribuição,
mudança de status, configurações e ações sensíveis; tela `/audit` só admin.
CPF e renda são PII sensível. O parceiro declara o consentimento do cliente
a cada indicação.

## 10. Operação

- **Migrations:** SQL em `db/migrations/` (numeradas; a partir da 0035 não
  passam pelo journal do Drizzle). Fluxo: a migration é escrita no repo → o
  owner aplica no SQL Editor do Supabase e confere → só então o código que
  depende dela vai pra `main`. Toda tabela nova com RLS.
- **Deploy:** merge na `main` (`--no-ff`, "Merge: ...") e push; a Vercel publica.
- **Scripts:** `scripts/` (migração do portal antigo, baseline de
  performance, checagem de RLS). Gravar jsonb via dollar-quote, nunca
  `${JSON.stringify(x)}::jsonb`.
- **Validação local:** o repo fica no iCloud e o `node_modules` pode ficar
  "dataless" — rodar `tsc`, `eslint` e `vitest` numa cópia fora do iCloud.

## 11. Pendências conhecidas

- Virada do domínio `parceiros.credios.com.br` (passos do owner em CLAUDE.md
  §14, Fase 5) e remoção da integração com o portal antigo depois de 30 dias.
- Saúde por consultor ainda soma todos os produtos.
