# Atendimento WhatsApp — Heloísa (IA) — Objetivo 3

Bot de WhatsApp que atende o cliente, identifica o lead no CRM, qualifica (estilo
Avanti), tranquiliza e passa pro consultor. Arquitetura **direta no WhatsApp Cloud
API (Meta)** — o nosso servidor **é** o bot. **Sem Kommo no caminho.**

Atende em dois modos, ambos no ar:
- **Reativo** — o cliente manda mensagem primeiro.
- **Proativo** — a Heloísa inicia a conversa quando o lead conclui a simulação.

Aceita **texto, botões de template e áudio** (notas de voz são transcritas e
respondidas com texto).

> **Histórico (por que NÃO usamos o Kommo Salesbot):** o Salesbot é pra fluxos
> scriptados (botão), não pra conversa de IA aberta — sem loop utilizável ("ir
> para" não existe, auto-reinício bloqueado, gatilho "a cada mensagem" com cooldown
> de 5 min) e o "Agente de IA" nativo não acessa nossos campos do CRM. Pivotamos
> pra arquitetura direta no Meta em 2026-06-23. O Kommo foi **removido** do código.

---

## 1. Arquitetura

```
REATIVO (cliente fala primeiro)
Cliente ─WhatsApp─> Meta Cloud API ─webhook─> /api/whatsapp/webhook
                                                 │  (áudio → transcreve no Groq)
                                                 ▼
                                   responderMensagem(phone, texto):
                                     acha o lead → roteia → Heloísa (Sonnet 4.6)
                                     → grava qualificação + timeline
                                                 │
                                                 ▼
                                   enviarTextoWhatsApp() ─Send API─> Cliente

PROATIVO (Heloísa inicia)
Lead conclui simulação ─> webhook de lead dispara o template aprovado ─> Meta ─> Cliente
   • Confirmar  → Heloísa qualifica normalmente
   • Agora não  → opt-out educado (não envia mais por esse canal)
```

A conversa **inteira** (as duas pontas) + a qualificação vivem no **nosso CRM**
(`interacoes` + card na ficha). O Kommo só mostrava as mensagens do cliente; por
isso a fonte de verdade é o CRM.

---

## 2. Componentes (código)

| Arquivo | Papel |
|---|---|
| `src/app/api/whatsapp/webhook/route.ts` | GET (verificação do Meta) + POST (mensagens entrantes; ack <5s, processa no `after()`, valida `X-Hub-Signature-256`). Trata **texto**, **botão** (Confirmar/Agora não), **interactive** e **áudio** (transcreve). |
| `src/lib/whatsapp/responder.ts` | `responderMensagem(phone, texto)`: acha o lead, **roteia**, persiste qualificação, registra timeline, anexa link de documentos no encerramento, trata opt-out e silêncio pós-conclusão. |
| `src/lib/whatsapp/heloisa.ts` | Cérebro: system prompt (persona + base + guardrails + roteiro) + **Claude Sonnet 4.6** (JSON `{resposta, qualificacao, encerrar}`), cliente lazy com `maxRetries: 5`. |
| `src/lib/whatsapp/meta.ts` | `enviarTextoWhatsApp`, `enviarTemplateWhatsApp`, `baixarMidiaWhatsApp` (download de mídia em 2 passos). |
| `src/lib/whatsapp/proativo.ts` | `enviarProativoWhatsapp` (claim atômico idempotente + envia o template + loga a abertura). Reusado pelo webhook de lead e pelo cron. |
| `src/lib/whatsapp/transcrever.ts` | `transcreverAudio` (Groq Whisper) + `transcreverAudioWhatsapp` (baixa do Meta + transcreve). |
| `src/app/api/webhooks/lead/route.ts` | `agendarProativoSeCompleto`: dispara o template **na conclusão** da simulação. |
| `src/app/api/cron/proativo-whatsapp/route.ts` | Cron (5 min): fallback do proativo — quem deu o WhatsApp mas não concluiu em 15 min. |
| `src/app/api/cron/whatsapp-health/route.ts` | Cron (2 h): health-check de falha silenciosa → alerta por **e-mail**. |
| `src/components/leads/lead-whatsapp-conversa.tsx` | Card de chat (somente leitura) com a conversa na ficha do lead. |
| `src/components/leads/lead-detail-sections.tsx` | Card "Qualificação por WhatsApp". |

---

## 3. A Heloísa (persona / base / guardrails)

Tudo no system prompt de `heloisa.ts`:

- **Persona:** Heloísa, analista de crédito da Credios. Acolhedora, de referência,
  humana, mensagens **curtas** (WhatsApp), 1 pergunta por vez, 1 emoji ocasional,
  usa o 1º nome. Só admite ser "assistente virtual" se perguntada **diretamente**.
- **Posicionamento da Credios (SUPERIOR ao banco, nunca inferior):** não somos
  banco — e isso é **vantagem** do cliente. Um banco oferece só o produto dele e
  não busca a melhor condição; a Credios é parceira de **30+ instituições** e as
  coloca pra disputar o caso, buscando a melhor proposta — **de graça** e **sem
  compromisso**. Mostrar a superioridade com classe, sem falar mal de banco.
- **Base de conhecimento (aprovada):** retorno em ~5 dias úteis após a documentação;
  taxas a partir de **1,09% a.m. + IPCA** (final depende da análise); **não garante
  aprovação**. **Imóvel de terceiros (PF):** o dono assina como **garantidor** (cede
  o imóvel) sem ser devedor. **Imóvel de PJ:** comum e tranquilo; pergunta se a
  empresa é só do cliente — em qualquer caso é simples (nunca passar a impressão de
  "caminho específico/difícil").
- **Roteiro (1 pergunta por vez):** (1) apresenta a Credios + confirma a proposta
  (valor+cidade) e tranquiliza; (2) objetivo do crédito; (3) titularidade do imóvel
  (próprio / terceiro PF / PJ); (4) documentação regularizada; (5) pendências
  (inventário/ação/bloqueio); (6) urgência (até 30d / 1–3m / sem pressa); (7) encerra,
  passa pro consultor **e envia o link do portal de documentos** (acelera a aprovação).
- **Guardrails:** nunca promete taxa/valor/aprovação; sem conselho jurídico/financeiro;
  fora do tema → redireciona com gentileza; não inventa; resiste a prompt-injection;
  depois de concluir, não puxa assunto novo.

### Roteamento por estado do lead (`responder.ts`)
- **não encontrado** → convida a simular (`credios.com.br/simulador`).
- **desqualificado** → recusa educada.
- **opt-out** (cliente clicou **"Agora não"** no template) → agradece, avisa que não
  envia mais por esse canal, marca `qualif_whatsapp_status = optout`.
- **qualificação concluída** → responde no máx. **3** mensagens com um fecho breve,
  depois **silencia**.
- **áudio** → baixa do Meta + transcreve (Groq); falha → "pode mandar por texto?".
- **ativo** → Heloísa qualifica. Fallback determinístico se o Claude falhar.

### Qualificação no CRM
Campos `leads.qualif_*` (migration 0033) + `qualif_whatsapp_status`
(`template_enviado` → `em_andamento` → `concluida`, ou `optout`). Exibidos no card
**"Qualificação por WhatsApp"**; a conversa completa no card **"Conversa no WhatsApp"**
(ambos ocultos pro perfil `marketing`, por conter PII).

---

## 4. Proativo (template + timing)

- **Template aprovado (WABA):** `novo_modelo_do_whatsapp_22_06_2026_14_55_ja7gtf`
  (categoria **Marketing**, `pt_BR`, 1 variável `{{1}}` = primeiro nome, botões
  **Confirmar** / **Agora não**).
- **Quando dispara — "simulação completa OU 15 min após a 1ª etapa, o que vier antes":**
  - **Imediato** (webhook de lead) quando a simulação está **completa** — sinal =
    `objetivoCredito` presente (o mini-form da 1ª etapa **não** tem). Cobre o fluxo
    único do Google Ads e o enriquecimento final (etapa 5).
  - **Cron `/api/cron/proativo-whatsapp` (5 min):** alcança quem deu o WhatsApp na 1ª
    etapa mas **não concluiu** em 15 min. Janela `[agora-2h, agora-15min]` +
    `valorCredito` presente → não varre histórico nem outros canais.
  - **Idempotência:** claim atômico em `qualif_whatsapp_status` (nunca dispara 2×).

---

## 5. Áudio (notas de voz)

- Webhook detecta `type:"audio"` → `baixarMidiaWhatsApp` (2 GETs no Graph) →
  `transcreverAudio` no **Groq Whisper** (`whisper-large-v3-turbo`, `language: pt`,
  aceita o **OGG/Opus** do WhatsApp direto) → o texto entra na Heloísa como mensagem
  normal → ela **responde com texto**.
- Na conversa do CRM aparece como **"🎤 \<transcrição\>"**.
- Falha (sem `GROQ_API_KEY`, erro de rede) → texto vazio → fallback "manda por texto".
- **Não guardamos o arquivo de áudio** (decisão: desnecessário) — só a transcrição.

---

## 6. Health-check (falha silenciosa)

Cron `/api/cron/whatsapp-health` (a cada 2 h): detecta leads cuja **última** mensagem
de WhatsApp é do **cliente** (recebida entre 30 min e 3 h atrás) **sem resposta** —
excluindo silêncio legítimo (concluída/opt-out/terminais). Se achar, **alerta por
e-mail** (`sendWhatsappHealthEmail` → `WHATSAPP_ALERT_EMAIL`, default
`gabriel.meirelles@credios.com.br`). Sinaliza token do Meta expirado / Meta fora / bug.

---

## 7. Variáveis de ambiente (Vercel — Production)

| Var | O que é |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID do número (Meta → WhatsApp → API Setup). |
| `WHATSAPP_ACCESS_TOKEN` | Token **permanente** (System User: `whatsapp_business_messaging` + `whatsapp_business_management`). |
| `WHATSAPP_VERIFY_TOKEN` | Segredo escolhido por nós; o mesmo no webhook do Meta. |
| `WHATSAPP_APP_SECRET` | App Secret do Meta (valida a assinatura). Opcional (sem ele, pula a validação). |
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.6 (cérebro da Heloísa). |
| `GROQ_API_KEY` | Groq Whisper (transcrição de áudio). Sem ela, áudio cai no fallback. |
| `CRON_SECRET` | Auth dos crons (injetado pelo Vercel Cron como `Authorization: Bearer`). |
| `RESEND_API_KEY` | Envio de e-mail (health-check + notificações de lead). |
| `WHATSAPP_ALERT_EMAIL` | Destinatário do alerta do health-check. Opcional (default `gabriel.meirelles@credios.com.br`). |

> Env var só entra em vigor **no deploy** — ao alterar, **redeploy**.

---

## 8. Crons (`vercel.json`)

| Path | Schedule | Função |
|---|---|---|
| `/api/cron/proativo-whatsapp` | `*/5 * * * *` | Fallback de 15 min do proativo. |
| `/api/cron/whatsapp-health` | `0 */2 * * *` | Health-check → e-mail. |

(Há também `sla-check` e `refresh-mvs`, não relacionados ao WhatsApp.)

---

## 9. Setup no Meta (uma vez) — **app já está LIVE**

1. App em `developers.facebook.com` (Business) + produto WhatsApp, ligado à WABA.
2. **WhatsApp → Configuração da API:** Phone Number ID + WABA ID.
3. **Token permanente:** Business Settings → Usuários do sistema → token com
   `whatsapp_business_messaging` + `whatsapp_business_management`.
4. **Webhook:** Callback `https://crm.credios.com.br/api/whatsapp/webhook`, Verify
   token = `WHATSAPP_VERIFY_TOKEN`, **assinar o campo `messages`**.
5. **App em modo Live** (publicado) — necessário pra receber webhook de **qualquer**
   cliente (não só testadores). Já está publicado e atendendo clientes reais.

---

## 10. ⚠️ Compliance (Meta, desde jan/2026)

O Meta **só permite bots task-specific** (suporte, qualificação, status…), **não**
chatbots de IA de propósito geral. A Heloísa (qualificação de crédito) é compliant —
por isso os **guardrails são obrigatórios** (não pode sair do tema de crédito/garantia).

---

## 11. Marketing (reaproveitar a infra)

A mesma infra envia **campanhas de marketing** (templates Marketing). Cuidados:
**opt-in obrigatório** (só quem consentiu, senão o número é banido), **qualidade**
(idealmente número separado do atendimento pra não contaminar), **custo por envio**
(~R$0,30–0,40). Build estimado: seletor de público + gestor de templates + disparador
em lote (reusa `proativo.ts`) + registro de opt-out (base já existe).

---

## 12. Debug

```bash
npx vercel logs crm.credios.com.br --json --since 15m -n 500 | grep -i "whatsapp\|proativo\|transcrever\|cron health"
```
Logs do cérebro: `recebido de`, `lead:`, `heloisa:` (qualificação) ou
`heloisa falhou — fallback:`. Proativo: `[proativo] template enviado`. Cron de
saúde: `[cron health] pendentes=N`.

> **Build local nesta máquina é instável** (flakiness de leitura do node_modules →
> erros espúrios de `lib`/iterator no `next build`). Validar com `tsc --noEmit`
> (sem apagar `.next/types`) e confiar no **build do Vercel** como autoritativo:
> `curl https://crm.credios.com.br/api/version` deve refletir o SHA do commit.

---

## 13. Pendências / próximos passos

- **Convidar o destinatário certo** / confirmar o `WHATSAPP_ALERT_EMAIL` do health-check.
- **Rotacionar** os tokens (Meta) e a `GROQ_API_KEY` que passaram por chat no dev.
- **Desconectar o número do Kommo** (redundante; a conversa vive no CRM).
- Opcional: player de áudio no card (guardar o original) — **descartado por ora**.
