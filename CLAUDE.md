# CRM Credios — Briefing Técnico para Construção com Claude Code

> Este documento é o **único contrato** entre o owner (Gabriel Marinho Meirelles) e o agente de codificação (Claude Code). Toda decisão que não estiver aqui deve ser perguntada antes de implementada. Toda decisão que estiver aqui é vinculante e não deve ser "melhorada" sem confirmação.

> **Stack alvo:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase (Postgres + Auth + Storage) + Vercel. Domínio: `crm.credios.com.br`.

---

## 1. Contexto de negócio

A **Credios** é uma consultoria de crédito imobiliário e correspondente bancário com sede em Blumenau/SC, atuando há 7+ anos no segmento de Crédito com Garantia de Imóvel (CGI / home equity) e Financiamento Imobiliário. Originou mais de R$ 100M em crédito para 500+ clientes, com taxa de aprovação de 90%.

Hoje, o CRM da empresa vive em uma database do Notion ("CRM de Leads"). Essa solução não escala — falta autenticação granular, relatórios, automação de roteamento, e sobretudo confiança para parceiros externos submeterem operações. Esse projeto substitui o CRM do Notion por um sistema próprio, multi-usuário, com auth, pipeline visual, e relatórios.

**Foco do MVP:** apenas o produto **Crédito com Garantia de Imóvel (CGI)**. Outros produtos (financiamento imobiliário, condomínio, consórcio) ficam fora do MVP e entram em versões futuras.

**Usuários:** 2 hoje (Gabriel + Rodrigo), expectativa de 8-10 nos próximos 12 meses.

---

## 2. Princípios de design e não-negociáveis

1. **Lean e funcional antes de bonito.** Visual segue padrão shadcn/ui sem customização excessiva. Performance e correção sobre estética.
2. **Mobile-friendly mas não mobile-first.** Os usuários trabalham primariamente em desktop. Mobile precisa funcionar bem para consultas e atualizações rápidas, mas o fluxo principal é desktop.
3. **Português brasileiro em toda a UI.** Sem strings em inglês visíveis ao usuário, exceto nomes técnicos consagrados (ex.: "WhatsApp", "GCLID").
4. **LGPD desde o início.** Dados sensíveis (CPF, renda) acessíveis apenas a usuários autorizados. Logs de auditoria de quem viu o quê.
5. **Não inventar features.** Se não está neste documento, **perguntar antes de implementar**. Especialmente: integração com bancos, OCR de documentos, IA generativa para sugestões — nada disso entra no MVP.
6. **Idempotência nas integrações.** Webhook do site pode retentar — sistema não pode duplicar leads pelo mesmo evento.
7. **Configurabilidade pelo Admin via UI.** Regras de roteamento, templates de mensagem, opções de status — Admin edita pela interface, sem mexer em código.

---

## 3. Stack técnico vinculante

| Camada | Tecnologia | Versão alvo |
|---|---|---|
| Framework | Next.js (App Router) | 15.x |
| Linguagem | TypeScript | 5.x (strict mode) |
| Estilização | Tailwind CSS | 4.x |
| Componentes UI | shadcn/ui | latest |
| Banco de dados | Postgres via Supabase | latest |
| Autenticação | Supabase Auth (Google OAuth + email/senha) | latest |
| 2FA | Supabase MFA TOTP | latest |
| Storage de arquivos | Supabase Storage (v2 — uploads de documentos) | latest |
| ORM/Query builder | Drizzle ORM | latest |
| Validação | Zod | latest |
| Forms | React Hook Form + Zod | latest |
| Tabelas | TanStack Table v8 | latest |
| Kanban | dnd-kit (drag-and-drop) | latest |
| Notificações in-app | Sonner (toast) + Supabase Realtime para updates ao vivo | latest |
| Notificações email | Resend (já em uso pela Credios) | latest |
| Deploy | Vercel | — |
| Repositório | GitHub privado, separado do site da Credios | — |

**Justificativa de escolhas:**
- **Supabase** sobre Firebase/outros: Postgres real, RLS (Row Level Security) é fundamental para o modelo de permissão, free tier generoso, fácil deploy.
- **Drizzle** sobre Prisma: melhor TypeScript, mais leve, mais transparente. Claude Code lida bem com ambos, mas Drizzle tem migrations mais previsíveis.
- **shadcn/ui**: padrão da indústria, copy-paste components que ficam no repositório (sem dependência externa de versão), totalmente customizável.

---

## 4. Modelo de dados (schema)

### 4.1 Tabelas principais

```sql
-- Usuários (extensão da auth.users do Supabase)
users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'gerente', 'consultor', 'marketing')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  whatsapp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Lead = pessoa física com solicitação de crédito
leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados pessoais
  nome TEXT NOT NULL,
  cpf TEXT, -- formato: 000.000.000-00 ou null se ainda não informado
  estado_civil TEXT, -- 'Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'
  ocupacao TEXT, -- 'CLT', 'Autônomo', 'Empresário', 'Servidor Público', 'Aposentado', 'Outro'
  renda_mensal_centavos BIGINT, -- valores em centavos para evitar problemas de float
  whatsapp TEXT, -- formato E.164: +5561999098289
  email TEXT,
  cidade TEXT,
  estado TEXT, -- UF de 2 letras

  -- Dados da operação
  produto TEXT NOT NULL DEFAULT 'CGI', -- no MVP só CGI; futuro: 'CGI', 'Financiamento', 'Condomínio'
  objetivo_credito TEXT, -- 'Quitar Dívidas', 'Capital de Giro', 'Investimento', 'Reforma', 'Outro'
  tipo_imovel TEXT, -- 'Casa', 'Apartamento', 'Comercial', 'Terreno', 'Rural'
  situacao_imovel TEXT, -- 'Quitado', 'Financiado', 'Em Inventário', 'Outro'
  tipo_pessoa TEXT, -- 'Pessoa Física', 'Pessoa Jurídica'
  valor_imovel_centavos BIGINT,
  valor_credito_centavos BIGINT,

  -- Pipeline
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN (
    'novo', 'conversa_inicial', 'aguardando_resposta', 'aguardando_documentacao',
    'documentacao_enviada', 'em_negociacao', 'fechado', 'perdido', 'sem_resposta', 'desqualificado'
  )),
  motivo_desqualificacao TEXT, -- preenchido quando status = 'desqualificado' ou 'perdido'

  -- Atribuição
  consultor_id UUID REFERENCES users(id),
  atribuido_em TIMESTAMPTZ,
  atribuido_por UUID REFERENCES users(id), -- pode ser sistema (regra) ou admin

  -- Tracking de origem
  origem TEXT, -- 'Google', 'Instagram', 'Facebook', 'YouTube', 'Orgânico', 'Indicação', 'LinkedIn', 'ChatGPT', 'Condomínio', 'Manual'
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  gclid TEXT,
  rede TEXT, -- 'Google Search', 'Search Partners', 'Display', 'YouTube'
  dispositivo TEXT, -- 'Mobile', 'Desktop', 'Tablet'
  palavra_chave TEXT,
  grupo_anuncios TEXT,
  criativo TEXT,
  tipo_correspondencia TEXT, -- 'Exata', 'Frase', 'Ampla'
  referrer TEXT,
  pagina_entrada TEXT, -- URL com path completo

  -- Dados de fechamento (preenchidos quando status = 'fechado')
  banco_aprovador TEXT,
  valor_liberado_centavos BIGINT,
  comissao_centavos BIGINT,
  data_fechamento DATE,

  -- Auditoria
  raw_payload JSONB, -- payload bruto recebido do webhook, para debug
  ultimo_contato TIMESTAMPTZ,
  esfriando BOOLEAN GENERATED ALWAYS AS (
    ultimo_contato IS NOT NULL AND ultimo_contato < NOW() - INTERVAL '3 days'
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) -- null se vier de webhook automático
)

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_consultor ON leads(consultor_id);
CREATE INDEX idx_leads_origem ON leads(origem);
CREATE INDEX idx_leads_criado ON leads(created_at DESC);
CREATE INDEX idx_leads_cpf ON leads(cpf) WHERE cpf IS NOT NULL;

-- Timeline de interações
interacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES users(id), -- null se for evento de sistema
  tipo TEXT NOT NULL CHECK (tipo IN (
    'ligacao', 'whatsapp_enviado', 'whatsapp_recebido', 'email', 'reuniao',
    'anotacao', 'mudanca_status', 'mudanca_atribuicao', 'documento_recebido', 'evento_sistema'
  )),
  conteudo TEXT, -- texto livre
  metadata JSONB, -- ex: {"de_status": "novo", "para_status": "conversa_inicial"}
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

CREATE INDEX idx_interacoes_lead ON interacoes(lead_id, criado_em DESC);

-- Regras de roteamento configuráveis pelo Admin
regras_roteamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativa BOOLEAN NOT NULL DEFAULT true,
  prioridade INTEGER NOT NULL DEFAULT 0, -- regras com maior prioridade aplicam primeiro
  -- Condições (todas precisam bater para a regra acionar)
  condicoes JSONB NOT NULL,
  -- Ex.: {"valor_credito_min": 50000000, "estado_in": ["SC", "PR"], "origem_in": ["YouTube"]}
  -- Ação
  acao TEXT NOT NULL CHECK (acao IN ('atribuir_usuario', 'round_robin_grupo', 'pool_nao_atribuido')),
  parametros JSONB, -- {"usuario_id": "..."} ou {"grupo_usuarios": [...]}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Estado do round-robin (para distribuição justa)
round_robin_estado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regra_id UUID REFERENCES regras_roteamento(id),
  ultimo_usuario_id UUID REFERENCES users(id),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Playbook de mensagens (templates editáveis pelo Admin)
mensagens_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL, -- ex: "Mensagem de boas-vindas"
  ordem INTEGER NOT NULL DEFAULT 0,
  status_aplicavel TEXT[], -- ex: ['novo'] - quando aparece como sugerida
  conteudo TEXT NOT NULL, -- com variáveis: {{nome}}, {{valor_credito}}, {{primeiro_nome}}
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Possíveis duplicidades de CPF (pendentes de revisão manual)
duplicidades_pendentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novo_lead_id UUID NOT NULL REFERENCES leads(id),
  lead_existente_id UUID NOT NULL REFERENCES leads(id),
  cpf TEXT NOT NULL,
  resolvido_em TIMESTAMPTZ,
  resolvido_por UUID REFERENCES users(id),
  resolucao TEXT, -- 'merge', 'manter_separado', 'descartar'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- SLA tracking
sla_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('primeiro_contato_atrasado', 'lead_esfriando')),
  disparado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em TIMESTAMPTZ
)

-- Audit log (LGPD)
audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES users(id),
  acao TEXT NOT NULL, -- 'lead_visualizado', 'lead_editado', 'lead_atribuido', 'usuario_criado', etc.
  recurso_tipo TEXT, -- 'lead', 'usuario', 'regra', etc.
  recurso_id UUID,
  metadata JSONB,
  ip TEXT,
  user_agent TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

CREATE INDEX idx_audit_usuario ON audit_log(usuario_id, criado_em DESC);
CREATE INDEX idx_audit_recurso ON audit_log(recurso_tipo, recurso_id, criado_em DESC);
```

### 4.2 Row Level Security (RLS)

Todas as tabelas com dados sensíveis devem ter RLS habilitada. Políticas mínimas:

```sql
-- leads: Admin e Gerente veem tudo. Consultor vê só os atribuídos a ele.
-- Marketing vê todos os leads mas com colunas mascaradas (CPF, renda).
-- Implementar via views separadas + grant.

-- interacoes: mesmas regras de leads (consultor só vê interações dos leads dele).

-- audit_log: só admin vê.
```

### 4.3 Migrations e seeds

- Usar Drizzle Kit para migrations versionadas em `/db/migrations`.
- Seed inicial deve incluir:
  - 1 usuário Admin: Gabriel Marinho Meirelles (`gabriel@credios.com.br`)
  - 1 usuário Consultor: Rodrigo (`rodrigo@credios.com.br`)
  - 5 mensagens de template padrão conforme §6.7

---

## 5. Modelo de permissões

| Perfil | Ver leads | Editar leads | Atribuir leads | Ver dados financeiros (renda, valor) | Ver CPF | Configurar regras | Gerenciar usuários | Ver audit log |
|---|---|---|---|---|---|---|---|---|
| **admin** | Todos | Todos | Sim | Sim | Sim | Sim | Sim | Sim |
| **gerente** | Todos | Todos | Sim | Sim | Sim | Não | Não | Não |
| **consultor** | Só atribuídos | Só atribuídos (campos limitados) | Não | Sim (dos seus) | Sim (dos seus) | Não | Não | Não |
| **marketing** | Todos | Não | Não | Não (mascarado) | Não (mascarado) | Não | Não | Não |

**Mascaramento para perfil Marketing:**
- CPF: `***.***.***-XX` (mostra apenas últimos 2 dígitos)
- Renda: substituir valor por faixa: "Até R$ 5k", "R$ 5k–10k", "R$ 10k–20k", "R$ 20k–50k", "Acima R$ 50k"
- Telefone/WhatsApp: ocultar completamente
- Email: domínio apenas (`***@gmail.com`)

---

## 6. Funcionalidades do MVP

### 6.1 Autenticação

- Login com **Google SSO** (preferencial, dado o Google Workspace da Credios) + **email/senha** como fallback.
- **2FA via TOTP obrigatório** para perfil Admin. Opcional para os demais perfis.
- Sessão persistente com refresh tokens. Logout manual.
- Recuperação de senha por email (Resend).
- Tela de primeiro login: usuário define nome de exibição e configura 2FA se Admin.

### 6.2 Ingestão de leads

**Endpoint público de webhook:**
```
POST /api/webhooks/lead
Headers: x-webhook-secret: <SECRET>
Body: JSON conforme spec abaixo
```

O endpoint recebe o payload do formulário Wizard do site da Credios (que hoje envia para Notion API). O CRM substitui esse destino: o site passa a enviar para `https://crm.credios.com.br/api/webhooks/lead`.

**Payload esperado** (compatível com o que já existe hoje, conforme observado em leads do Notion):

```typescript
{
  // Dados pessoais
  nome: string,
  cpf?: string,
  estado_civil?: 'Solteiro(a)' | 'Casado(a)' | 'Divorciado(a)' | 'Viúvo(a)' | 'União Estável',
  ocupacao?: string,
  renda_mensal?: number, // em reais
  whatsapp: string, // formato E.164 ou outro — sistema normaliza
  email?: string,
  cidade?: string,
  estado?: string, // UF

  // Operação
  produto?: 'CGI', // default
  objetivo_credito?: string,
  tipo_imovel?: string,
  situacao_imovel?: string,
  tipo_pessoa?: 'Pessoa Física' | 'Pessoa Jurídica',
  valor_imovel?: number,
  valor_credito?: number,

  // Tracking
  origem?: string,
  utm_source?: string,
  utm_medium?: string,
  utm_campaign?: string,
  utm_term?: string,
  utm_content?: string,
  gclid?: string,
  rede?: string,
  dispositivo?: string,
  palavra_chave?: string,
  grupo_anuncios?: string,
  criativo?: string,
  tipo_correspondencia?: string,
  referrer?: string,
  pagina_entrada?: string,
}
```

**Fluxo de processamento:**
1. Validar com Zod. Se inválido, retornar 400 com detalhes.
2. Validar header de secret. Se ausente/errado, retornar 401.
3. Verificar idempotência: hash do payload + timestamp da janela de 60s. Se já processado, retornar 200 com `{duplicate: true}`.
4. **Verificar duplicidade por CPF**: se CPF informado e existe lead anterior com mesmo CPF, **criar o lead novo normalmente** mas registrar entrada em `duplicidades_pendentes` para revisão. Não bloquear, apenas alertar Admin via badge na tela.
5. Salvar payload bruto em `leads.raw_payload`.
6. Aplicar regras de roteamento (ver §6.4).
7. Disparar notificação para o consultor atribuído (e Admin) via toast in-app + email se fora do horário comercial.
8. Retornar 201 com `{lead_id}`.

**Importante:** o endpoint deve ser idempotente e tolerante a retries.

### 6.3 Ingestão manual

Botão "Novo Lead" na interface, disponível para Admin, Gerente e Consultor. Form com mesmos campos do payload, validação Zod no client e server. Origem default = 'Manual'. Atribuição padrão = usuário criador (mas pode escolher outro).

### 6.4 Regras de roteamento

**Comportamento default no MVP:** todos os leads ficam em "pool não-atribuído" até o Admin atribuir manualmente. Isso replica o comportamento atual do Notion (aba "NOVOS").

**Configurável pelo Admin via UI:** lista de regras priorizadas. Cada regra tem condições (todas verdadeiras = aplica) e ação. Tela de configuração em `/configuracoes/roteamento`.

**Tipos de condição suportados no MVP:**
- `valor_credito_min` / `valor_credito_max`
- `valor_imovel_min` / `valor_imovel_max`
- `estado_in` (lista de UFs)
- `origem_in` (lista de origens)
- `tipo_imovel_in`
- `horario_comercial` (boolean: regra só vale em horário comercial)

**Tipos de ação suportados:**
- `atribuir_usuario`: atribui ao usuário X.
- `round_robin_grupo`: distribui em round-robin entre lista de usuários.
- `pool_nao_atribuido`: deixa sem atribuição (caso default).

**Exemplo de regra que o Admin pode criar via UI:**
```
Nome: "Leads alta renda para Gabriel"
Prioridade: 100
Condições: valor_credito_min = 500000
Ação: atribuir_usuario(Gabriel)
```

```
Nome: "Round robin para outros leads"
Prioridade: 10
Condições: (nenhuma)
Ação: round_robin_grupo([Rodrigo, ConsultorB, ConsultorC])
```

Se nenhuma regra ativa bater, lead vai para pool não-atribuído.

### 6.5 Pipeline e visualizações

**Status (10 valores):** `novo`, `conversa_inicial`, `aguardando_resposta`, `aguardando_documentacao`, `documentacao_enviada`, `em_negociacao`, `fechado`, `perdido`, `sem_resposta`, `desqualificado`.

**Transições de status:** livres no MVP. Exceção: `fechado` é terminal — só Admin pode reabrir (transição inversa). Toda mudança de status registra evento em `interacoes` automaticamente.

**Quando muda para `fechado`:** abrir modal pedindo banco aprovador, valor liberado, comissão, data de fechamento. Esses campos são obrigatórios para concluir a transição.

**Quando muda para `desqualificado` ou `perdido`:** abrir modal pedindo motivo (dropdown):
- imóvel não atende critérios
- renda insuficiente
- localização fora da política
- LTV muito alto
- restrições no nome
- cliente desistiu
- taxa não competitiva
- já fechou com concorrente
- documentação irregular
- outro (campo livre)

#### 6.5.1 Visualização Kanban

- 10 colunas (uma por status), com contador de leads e somatório de valor buscado em cada coluna.
- Cards mostram: nome, valor buscado formatado, origem (badge colorida), data do último contato, foto/avatar do consultor atribuído, badge "esfriando" se aplicável.
- Drag-and-drop entre colunas dispara transição de status (com modal quando aplicável).
- Filtros aplicáveis: consultor, origem, faixa de valor, data de criação, dispositivo, estado (UF).

#### 6.5.2 Visualização Lista (tabela)

- Tabela TanStack com colunas configuráveis pelo usuário.
- Colunas default: nome, status, valor buscado, telefone (link WhatsApp), origem, consultor, último contato, criado em.
- Ordenação por qualquer coluna.
- Busca textual (nome, email, CPF, telefone).
- Filtros avançados (combinar múltiplos critérios).
- Seleção múltipla com ações em lote (reatribuir, mudar status, exportar CSV).
- Paginação server-side: 50 leads por página.

#### 6.5.3 Visualização Detalhe do Lead

URL: `/leads/[id]`

Layout em duas colunas no desktop:
- **Esquerda (60%):** dados estruturados editáveis em seções: Informações Pessoais, Contato, Imóvel e Crédito, Origem (somente leitura).
- **Direita (40%):** Timeline de interações (cronológica reversa), com input para nova interação no topo.

Header da página: nome do lead, badge de status, valor buscado, botões de ação (mudar status, reatribuir, link WhatsApp `wa.me/{numero}`, copiar email, marcar último contato).

Seção "Mensagens sugeridas": cards com templates do playbook aplicáveis ao status atual. Clicar copia para clipboard com variáveis substituídas (nome, valor, etc.).

### 6.6 Timeline de interações

Tipos de interação registrados:
- **Manual pelo usuário:** ligação, whatsapp_enviado, whatsapp_recebido, email, reuniao, anotacao
- **Automático pelo sistema:** mudanca_status, mudanca_atribuicao, evento_sistema (criação do lead, envio de notificação, alerta de SLA)

Cada interação manual: dropdown de tipo + textarea para conteúdo + botão "Registrar". Adicionar interação atualiza `leads.ultimo_contato`.

Botão "Marcar último contato" no header do lead: cria interação tipo `anotacao` com texto "Último contato registrado" e atualiza timestamp.

### 6.7 Playbook de mensagens

Tela `/configuracoes/mensagens` (Admin only):
- Lista de templates editáveis (nome, ordem, status aplicáveis, conteúdo, ativa).
- Preview de variáveis: `{{nome}}`, `{{primeiro_nome}}`, `{{valor_credito}}`, `{{valor_imovel}}`, `{{cidade}}`, `{{estado}}`.
- Botão "Adicionar template", "Editar", "Desativar".

Templates iniciais (seed):
1. **Boas-vindas (status: novo):**
   *"Olá, {{primeiro_nome}}! Aqui é da Credios. Recebemos sua solicitação de crédito de R$ {{valor_credito}} com garantia de imóvel. Em instantes vamos te chamar para entender melhor o caso. ✅"*
2. **Follow-up sem resposta (status: novo, conversa_inicial):**
   *"Oi, {{primeiro_nome}}! Tudo bem? Vi que você estava interessado em crédito com garantia de imóvel. Conseguiu olhar minha mensagem anterior? Posso te ajudar a entender melhor as condições. 🙂"*
3. **Solicitando documentação (status: aguardando_documentacao):**
   *"Olá, {{primeiro_nome}}! Para avançarmos com a análise da sua operação, preciso dos seguintes documentos: matrícula atualizada do imóvel, IPTU, RG/CNH, comprovante de renda dos últimos 3 meses e certidão de estado civil. Pode me enviar por aqui? 📎"*
4. **Após desqualificação:**
   *"Oi, {{primeiro_nome}}, agradeço o contato! Infelizmente, no momento não conseguimos atender o seu caso. Caso a situação mude no futuro, fique à vontade para nos procurar. Abraço!"*
5. **Após fechamento:**
   *"{{primeiro_nome}}, parabéns! Sua operação foi liberada com sucesso. Foi um prazer atender você. Qualquer coisa que precise daqui pra frente, é só chamar. 🤝"*

Admin pode editar todos esses ou criar novos.

### 6.8 SLA e alertas

**Regra de SLA primeiro contato:**
- Horário comercial confirmado: **08:00–18:00 horário de Brasília (BRT/BRST), de segunda a sexta-feira**, exceto feriados nacionais.
- Lead atribuído + status = `novo` + sem interação manual há mais de **30 minutos em horário comercial** → dispara `sla_alertas` tipo `primeiro_contato_atrasado`.
- Alerta visual: badge vermelho no card/linha do lead.
- Notificação: Admin recebe toast in-app + email (Resend).
- Resolução: ao registrar qualquer interação, alerta é resolvido automaticamente.

**Regra de "esfriando":**
- Lead em status ativo (não terminal) sem interação há mais de **3 dias** → flag `esfriando = true` (calculada).
- Aparece com ícone visual nas listagens.

### 6.9 Relatórios e dashboards

Tela `/relatorios` (Admin, Gerente, Marketing — com mascaramento para Marketing):

**Cards de topo (KPIs do mês corrente):**
- Total de leads novos
- Leads em pipeline ativo (R$ em valor buscado)
- Leads fechados no mês (R$ liberado e R$ comissão)
- Taxa de conversão Novo → Fechado (rolling 90 dias)

**Gráficos:**
- Volume de leads por dia/semana/mês, segmentado por origem (linha + área empilhada).
- Funil de conversão: quantidade em cada status (gráfico de funil ou barras).
- Tempo médio em cada status (barras horizontais).
- Performance por consultor: leads atribuídos, taxa de fechamento, tempo médio de SLA. (não disponível para perfil Marketing)
- Pipeline ativo por status: R$ em valor buscado por status.
- Receita realizada (comissão) por mês — últimos 12 meses. (não disponível para perfil Marketing)

**Auditoria Google Ads (replicar views existentes do Notion):**
- Seção dedicada com filtros pré-aplicados: leads de origem Google nos últimos 90 dias, segmentados por status.
- Colunas: nome, status, valor buscado, campanha, palavra-chave, GCLID, mídia, criado em, último contato.
- Botão "Exportar CSV" para alimentar análise externa em Looker Studio.

**Filtros globais nos relatórios:** período (últimos 7d, 30d, 90d, mês atual, trimestre, ano, custom), origem, consultor.

### 6.10 Gestão de usuários

Tela `/configuracoes/usuarios` (Admin only):
- Lista de usuários com nome, email, perfil, ativo.
- Botão "Convidar usuário": informa email + perfil. Sistema envia email de convite via Supabase Auth + Resend.
- Editar usuário: mudar perfil, desativar (não excluir — manter histórico).
- Reset de 2FA do usuário (Admin pode forçar reset se usuário perdeu acesso).

### 6.11 Audit log

Tela `/audit` (Admin only):
- Visualização do log de ações com filtros: usuário, ação, recurso, período.
- Eventos registrados: login, logout, lead_visualizado, lead_editado, lead_atribuido, lead_status_mudou, lead_criado, lead_excluido (não há exclusão real, mas se ação semelhante), usuario_criado, usuario_editado, regra_criada, regra_editada.
- Retenção: 12 meses no banco; após isso, exportação automática para storage (não no MVP — só registrar a intenção).

---

## 7. Fora do escopo do MVP (v2 ou depois)

**Explicitamente excluídos:**
- Upload e gestão de documentos do lead com OCR.
- Integração WhatsApp Business API (Kommo).
- Conversões offline para Google Ads (server-side tracking).
- Sistema de parceiros externos (portal de submissão).
- Motor de pré-qualificação proprietário (Peak Score-like).
- Integrações com bancos parceiros.
- Outros produtos além do CGI (financiamento imobiliário, condomínio).
- App mobile nativo.
- Notificações push/SMS.
- Importação de dados do Notion atual.

**Importante:** o schema de banco deve ser projetado para acomodar essas features futuras sem refactoring grande. Especificamente:
- Coluna `produto` em leads já permite múltiplos produtos.
- Tabelas de `interacoes` e `audit_log` já comportam novos tipos.
- Estrutura de regras_roteamento já é flexível para evoluir.

---

## 8. Estrutura de pastas

```
crm-credios/
├── .claude/
│   └── CLAUDE.md                    # este documento
├── .env.local.example
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
├── components.json                  # shadcn/ui config
├── public/
├── db/
│   ├── schema.ts                    # Drizzle schema (todas as tabelas)
│   ├── migrations/                  # migrations versionadas
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── recuperar-senha/page.tsx
│   │   │   └── primeiro-acesso/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx           # layout autenticado com sidebar
│   │   │   ├── leads/
│   │   │   │   ├── page.tsx         # lista (default)
│   │   │   │   ├── kanban/page.tsx  # kanban
│   │   │   │   ├── novo/page.tsx    # form de criar lead manual
│   │   │   │   └── [id]/page.tsx    # detalhe
│   │   │   ├── relatorios/
│   │   │   │   ├── page.tsx         # dashboard principal
│   │   │   │   └── google-ads/page.tsx
│   │   │   ├── configuracoes/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── usuarios/page.tsx
│   │   │   │   ├── roteamento/page.tsx
│   │   │   │   └── mensagens/page.tsx
│   │   │   ├── audit/page.tsx
│   │   │   └── perfil/page.tsx
│   │   ├── api/
│   │   │   ├── webhooks/
│   │   │   │   └── lead/route.ts    # POST público
│   │   │   ├── leads/
│   │   │   │   ├── route.ts         # GET (list) + POST (create)
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts     # GET + PATCH + DELETE
│   │   │   │       ├── status/route.ts
│   │   │   │       ├── atribuicao/route.ts
│   │   │   │       └── interacoes/route.ts
│   │   │   ├── relatorios/
│   │   │   │   └── ...
│   │   │   ├── configuracoes/
│   │   │   │   └── ...
│   │   │   └── cron/
│   │   │       └── sla-check/route.ts  # Vercel Cron a cada 5 min
│   │   ├── layout.tsx               # root
│   │   └── page.tsx                 # landing/redirect
│   ├── components/
│   │   ├── ui/                      # shadcn copy-paste
│   │   ├── leads/
│   │   │   ├── lead-card.tsx
│   │   │   ├── lead-table.tsx
│   │   │   ├── lead-kanban.tsx
│   │   │   ├── lead-detail.tsx
│   │   │   ├── lead-form.tsx
│   │   │   ├── lead-timeline.tsx
│   │   │   ├── status-badge.tsx
│   │   │   └── filters.tsx
│   │   ├── relatorios/
│   │   ├── shared/
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   └── ...
│   │   └── ...
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts            # client-side
│   │   │   ├── server.ts            # server-side com cookies
│   │   │   └── middleware.ts        # auth middleware
│   │   ├── auth/
│   │   │   ├── permissions.ts       # checkPermission(user, action, resource)
│   │   │   └── mascaramento.ts      # função para mascarar dados Marketing
│   │   ├── routing/
│   │   │   ├── engine.ts            # avalia regras_roteamento e atribui lead
│   │   │   └── round-robin.ts
│   │   ├── notifications/
│   │   │   ├── email.ts             # Resend
│   │   │   └── toast.ts
│   │   ├── validators/
│   │   │   ├── lead.ts              # zod schemas
│   │   │   └── webhook.ts
│   │   ├── formatters/
│   │   │   ├── currency.ts          # R$ formatting
│   │   │   ├── phone.ts             # E.164 ↔ display
│   │   │   ├── cpf.ts               # mask + validar
│   │   │   └── data.ts              # datas em pt-BR
│   │   ├── audit.ts                 # logAction(user, action, resource, ...)
│   │   └── constants.ts             # status, origens, etc.
│   ├── types/
│   │   └── ...
│   └── middleware.ts                # Next.js middleware (auth)
└── tests/
    ├── webhook.test.ts
    ├── routing-engine.test.ts
    ├── permissions.test.ts
    └── ...
```

---

## 9. Variáveis de ambiente

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Webhook
WEBHOOK_SECRET=

# Email (Resend)
RESEND_API_KEY=
EMAIL_FROM=crm@credios.com.br
EMAIL_REPLY_TO=gabriel@credios.com.br

# Google OAuth (configurado dentro do Supabase Auth, mas pode precisar de client_id/secret no projeto)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Outros
NEXT_PUBLIC_APP_URL=https://crm.credios.com.br
NODE_ENV=production
```

---

## 10. Considerações de segurança

- **HTTPS obrigatório.** Todos os endpoints atrás de TLS (Vercel garante).
- **CORS:** o webhook aceita apenas requisições com header `x-webhook-secret` correto. Demais endpoints da API só aceitam o domínio próprio + localhost dev.
- **Rate limiting:** webhook limitado a 60 req/min por IP. Demais endpoints: 600 req/min por usuário.
- **Sanitização de input:** Zod em toda entrada. Saneamento de HTML em campos de texto livre (anotações, mensagens) com DOMPurify se exibido renderizado.
- **CPF e renda:** considerados PII sensível. Acessos logados em audit_log. Mascarados para perfil Marketing.
- **Sessions:** cookies HttpOnly + Secure + SameSite=Lax. Refresh token rotativo.
- **2FA TOTP** obrigatório para Admin via Supabase MFA.
- **Backup:** Supabase faz backup diário no plano Pro. Considerar export semanal manual nos primeiros meses (script `pnpm db:backup`).

---

## 11. Plano de testes

**Testes unitários** (Vitest):
- Validators Zod (lead, webhook payload).
- Engine de roteamento (regras + round-robin).
- Funções de mascaramento de dados.
- Formatters (CPF, telefone, moeda).
- Verificação de permissões.

**Testes de integração** (Vitest + Supabase local):
- Fluxo de webhook: payload válido → lead criado → atribuição correta → interação de criação registrada.
- Fluxo de mudança de status com modal de fechamento.
- Fluxo de detecção de duplicidade por CPF.
- RLS: usuário consultor não consegue ver leads de outros.

**Testes E2E** (Playwright — opcional para MVP, recomendado para v2):
- Login → criar lead → mover no kanban → registrar interação → fechar.

---

## 12. Critérios de aceitação do MVP

O MVP é considerado pronto quando todos abaixo são verdadeiros:

1. ✅ Webhook em produção recebe payload do site da Credios e cria leads corretamente.
2. ✅ 2 usuários (Gabriel + Rodrigo) conseguem fazer login com Google SSO.
3. ✅ Gabriel tem 2FA ativado e funcionando.
4. ✅ Lead criado é atribuído conforme regras configuradas (ou cai no pool default).
5. ✅ Visualização Kanban funciona com drag-and-drop entre colunas, disparando modal quando aplicável (fechamento, desqualificação).
6. ✅ Visualização Lista com filtros e busca textual funciona.
7. ✅ Detalhe do lead permite editar dados, registrar interações, mudar status, reatribuir, copiar mensagens do playbook.
8. ✅ Alerta de SLA de 30 min em horário comercial dispara corretamente.
9. ✅ Dashboard de relatórios mostra os KPIs e gráficos especificados.
10. ✅ Auditoria Google Ads replica fielmente o que existe no Notion atual.
11. ✅ Audit log registra ações sensíveis.
12. ✅ Gabriel consegue criar uma regra de roteamento via UI sem mexer em código.
13. ✅ Gabriel consegue editar templates de mensagem via UI.
14. ✅ RLS testada e funcional (consultor não vê leads de outros).
15. ✅ Mascaramento de PII para perfil Marketing testado.
16. ✅ Deploy em `crm.credios.com.br` com HTTPS funcionando.

---

## 13. Próximos passos após MVP (roadmap v2)

Documentado aqui apenas para garantir que o schema seja projetado com expansão em mente. **Não implementar no MVP.**

1. **Upload de documentos** (Supabase Storage), com tipos: matrícula, IPTU, RG, comprovante renda, IR, certidão.
2. **Sistema de parceiros externos** (corretores, consultores de investimento, imobiliárias) com login próprio, submissão de leads via formulário, dashboard de comissões.
3. **Integração WhatsApp Business API** via Kommo ou direta.
4. **Server-side tracking** para Google Ads (offline conversions API).
5. **Motor de pré-qualificação proprietário** com regras determinísticas baseadas na política de crédito interna.
6. **Outros produtos:** financiamento imobiliário, crédito condomínio.
7. **Importação histórica** dos dados do Notion atual (se necessário).
