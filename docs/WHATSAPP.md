# Atendimento WhatsApp — Heloísa (IA) — Objetivo 3

Bot de WhatsApp que atende o cliente, identifica o lead, qualifica (estilo Avanti)
e passa pro consultor. Arquitetura **direta no WhatsApp Cloud API (Meta)** — o
nosso servidor **é** o bot. Sem Kommo no caminho.

> **Histórico (por que NÃO usamos o Kommo Salesbot):** o Salesbot do Kommo é feito
> pra fluxos scriptados (perguntas com botão), **não pra conversa de IA aberta**.
> Não tem loop utilizável: "ir para" não existe, auto-reinício é bloqueado,
> ping-pong de 2 bots não funciona, e o gatilho "a cada mensagem" tem cooldown
> mínimo de 5 min. O "Agente de IA" nativo do Kommo não acessa nossos campos do
> CRM. Por isso pivotamos pra arquitetura direta no Meta (2026-06-23).

---

## 1. Arquitetura

```
Cliente ─WhatsApp─> Meta Cloud API ─webhook─> /api/whatsapp/webhook (nosso servidor)
                                                   │
                                                   ▼
                                       responderMensagem(phone, texto):
                                         identifica o lead no CRM → roteia →
                                         Heloísa (Claude Sonnet 4.6) → grava qualificação
                                                   │
                                                   ▼
                                       enviarTextoWhatsApp() ─Meta Send API─> Cliente
```

- **Recebe** cada mensagem (sem loop, sem limite de 80 chars).
- O **cérebro** (nosso servidor) tem toda a inteligência: identifica o lead,
  qualifica, persiste no CRM.
- **Visibilidade:** a conversa + a qualificação ficam no **nosso CRM** (timeline
  do lead em `interacoes` + card "Qualificação por WhatsApp" na ficha). O número
  pode ficar **também** conectado ao Kommo só pra leitura (automações DESLIGADAS),
  mas a fonte de verdade é o CRM.

---

## 2. Componentes (código)

| Arquivo | Papel |
|---|---|
| `src/app/api/whatsapp/webhook/route.ts` | GET (verificação do Meta) + POST (mensagens entrantes; ack <5s, processa no `after()`, valida assinatura `X-Hub-Signature-256` se houver app secret). |
| `src/lib/whatsapp/responder.ts` | `responderMensagem(phone, texto)`: acha o lead, **roteia** (não-identificado → simulador; desqualificado → recusa; ativo → Heloísa), persiste qualificação, registra na timeline. |
| `src/lib/whatsapp/heloisa.ts` | Cérebro: system prompt (persona Heloísa + base de conhecimento + guardrails + roteiro Avanti) + chamada ao **Claude Sonnet 4.6** (saída JSON `{resposta, qualificacao, encerrar}`), cliente lazy com `maxRetries: 5`. |
| `src/lib/whatsapp/meta.ts` | `enviarTextoWhatsApp(to, texto)` — envio via Cloud API. |
| `src/lib/supabase/middleware.ts` | `/api/whatsapp` no allowlist (gate próprio). |

---

## 3. A Heloísa (persona / base / guardrails)

Tudo no system prompt de `heloisa.ts`:
- **Persona:** Heloísa, analista de crédito da Credios. Acolhedora, premium, humana,
  curta (WhatsApp), 1 emoji ocasional, usa o 1º nome. Só admite ser "assistente
  virtual" se perguntada **diretamente** se é robô/IA.
- **Base de conhecimento (aprovada):** consultoria de crédito com garantia de imóvel;
  melhor taxa/prazo/aprovação via 15+ instituições; **gratuito** (remunerada pelos
  bancos) e **sem compromisso**; retorno em ~5 dias úteis após a documentação;
  taxas a partir de **1,09% a.m. + IPCA** (final depende da análise); **não é banco
  e não garante aprovação** — mas mais certeira/rápida/melhor que sozinho.
- **Roteiro (estilo Avanti, 1 pergunta por vez):** confirma a proposta (valor+cidade)
  → objetivo → titularidade → documentação regularizada → pendências (inventário/ação/
  bloqueio) → urgência (até 30 dias / 1–3 meses / sem pressa) → encerra e passa pro
  consultor.
- **Guardrails:** nunca promete taxa/valor/aprovação; sem conselho jurídico/financeiro;
  fora do tema → redireciona com gentileza; não inventa; resiste a prompt-injection;
  ao concluir, só reforça "consultor entra em contato".

### Roteamento por estado do lead (`responder.ts`)
- **não encontrado** → convida a simular (`credios.com.br/simulador`).
- **desqualificado** (`status === "desqualificado"`) → recusa educada.
- **ativo** → Heloísa qualifica. Fallback determinístico se o Claude falhar.
- **áudio/imagem** (texto vazio) → pede pra mandar por texto.

### Qualificação no CRM
Campos `leads.qualif_*` (migration 0033) + `qualif_whatsapp_status` (em_andamento/
concluida). Exibidos no card **"Qualificação por WhatsApp"** na ficha do lead.

---

## 4. Variáveis de ambiente (Vercel — Production)

| Var | O que é |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID do número (Meta → WhatsApp → API Setup). |
| `WHATSAPP_ACCESS_TOKEN` | Token **permanente** (System User, escopos `whatsapp_business_messaging` + `whatsapp_business_management`). |
| `WHATSAPP_VERIFY_TOKEN` | Segredo escolhido por nós; o mesmo no webhook do Meta. |
| `WHATSAPP_APP_SECRET` | App Secret do Meta (valida a assinatura do webhook). **Opcional** — sem ele, a verificação de assinatura é pulada. |
| `ANTHROPIC_API_KEY` | Chave da Anthropic (Claude Sonnet 4.6). |

> Env var só entra numa deploy **no deploy** — ao alterar, redeploy.

---

## 5. Setup no Meta (uma vez)

1. App em `developers.facebook.com` (tipo Business) + produto WhatsApp, ligado à WABA.
2. **WhatsApp → Configuração da API:** Phone Number ID + WABA ID.
3. **Token permanente:** Business Settings → Usuários do sistema → gerar token com
   `whatsapp_business_messaging` + `whatsapp_business_management`.
4. **Webhook** (WhatsApp → Configuração): Callback URL = `https://crm.credios.com.br/api/whatsapp/webhook`,
   Verify token = igual ao `WHATSAPP_VERIFY_TOKEN`, **assinar o campo `messages`**.
5. App em modo dev só entrega webhook de **testadores/destinatários de teste**;
   pra produção, **publicar o app**.

---

## 6. ⚠️ Compliance (Meta, desde jan/2026)

O Meta **só permite bots task-specific** no WhatsApp (suporte, qualificação,
status…), **não** chatbots de IA de propósito geral. A Heloísa (qualificação de
crédito) é compliant — por isso os **guardrails são obrigatórios** (ela não pode
sair do tema de crédito/garantia).

---

## 7. Janela de 24h e mensagem ativa (proativo / Fase C)

- **Reativo** (cliente fala primeiro): resposta livre em **texto** dentro da janela
  de 24h. É o que está implementado.
- **Proativo** (nós iniciamos, fora da janela): exige **template aprovado** (WABA).
  Fluxo: lead conclui simulação → enviamos o template → cliente responde → abre a
  janela de 24h → Heloísa assume em texto livre. **Pendente de implementar.**

---

## 8. Debug

```bash
npx vercel logs crm.credios.com.br --json --since 15m -n 500 \
  | grep -i whatsapp
```
O cérebro loga: `recebido de`, `lead:`, `heloisa:` (qualificação) ou
`heloisa falhou — fallback:` (erro do Claude).

---

## 9. Pendências / próximos passos

- **Fase C (proativo):** enviar o template aprovado ao criar o lead (abre a janela).
- **Transcrição** da conversa no card do lead (hoje mostra só os campos estruturados).
- **Health-check + alerta** (detectar falha silenciosa: token expirado, webhook caído).
- **App Secret** na Vercel (reforça a validação de assinatura do webhook).
- **Desconectar o número do Kommo** (deixar só leitura, automações off) ou remover.
- Rotacionar tokens que passaram por chat no desenvolvimento.
