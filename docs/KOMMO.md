# Integração Kommo — Atendimento WhatsApp (Objetivo 3)

Bot de WhatsApp que responde o cliente automaticamente, identifica o lead pelo
telefone, confirma a proposta e manda o link do portal de documentos. Construído
sobre o **Salesbot do Kommo** + um **"cérebro"** no nosso servidor.

> **Princípio da arquitetura:** o Kommo é só o **cano** (transporte + gatilho). Toda
> a **inteligência** (identificação, roteamento, qualificação, tom, texto das
> mensagens, links) mora no **nosso servidor** (`/api/kommo/brain`), deployado
> livremente. Mudar a lógica/mensagens = deploy nosso, **zero** mudança no Kommo.
> O Kommo só precisa de setup pontual (gatilho + passo do widget + passo de
> mensagem); depois disso, fica intocado.

---

## 1. Visão geral do fluxo (reativo)

```
Cliente manda WhatsApp
        │
        ▼
Kommo recebe → dispara o Salesbot "Receptivo IA" (gatilho: qualquer nova conversa)
        │
        ▼
Passo "Widget Atendimento Credios (IA)" → POST widget_request → nosso cérebro
        │                                   (form-urlencoded: token + data[...] + return_url)
        ▼
/api/kommo/brain:
  1. lê corpo (form-urlencoded), valida o JWT (HS512, client_secret)
  2. resolve o telefone (vem vazio → busca na API do Kommo pelo entity_id)
  3. acha o lead no CRM pelo telefone (últimos 8 dígitos)
  4. monta a resposta (bolhas ≤ 80 chars)
  5. POST autenticado no return_url com execute_handlers `show` (uma bolha por show)
        │
        ▼
Kommo injeta as mensagens no WhatsApp do cliente → bot adiciona tag, muda etapa, encerra
```

---

## 2. O Widget (`kommo-widget/`)

Pasta com os fontes do widget que vira um **bloco no designer do Salesbot**. É
empacotada num `.zip` (arquivos na **raiz** do zip) e subida na integração privada.

### Estrutura (arquivos na raiz do zip)
- `manifest.json` — metadados + declaração do bloco do Salesbot.
- `script.js` — WebSDK (`define(["jquery"], …)`); o callback `onSalesbotDesignerSave`
  gera o passo `widget_request`.
- `i18n/{pt,en,es,tr,id}.json` — traduções (obrigatório os 5 locales do manifest).
- `images/logo.png` (**130×100**), `images/logo_main.png` (**400×272**),
  `images/logo_small.png` (**108×108**) — **tamanhos exatos exigidos**, senão o
  upload falha um a um.

### manifest.json — pontos que custaram caro
```json
{
  "widget": { "version": "1.x.y", "interface_version": 2, "installation": true, "locale": ["pt","en","es","tr","id"], ... },
  "locations": ["salesbot_designer", "settings"],
  "settings": { "url": { "name": "settings.brain_url", "type": "text", "required": false } },
  "salesbot_designer": {
    "credios_brain": {
      "name": "salesbot.brain_name",
      "settings": { "url": { "type": "url", "default_value": "https://crm.credios.com.br/api/kommo/brain", "manual": true } }
    }
  }
}
```
- **`installation: true`** é o que cria o botão **Instalar**. Com `false` o widget sobe
  mas fica inerte (aba "Configurações" vazia, sem como ativar).
- A location **`"settings"`** exige um objeto **`settings`** no manifest (senão:
  *`"settings" field is required in manifest.json`*).
- **Suba uma versão nova** a cada alteração pra forçar o Kommo a reprocessar.

### script.js — formato do passo (o bug que mais doeu)
O `onSalesbotDesignerSave` **tem** que devolver o handler dentro de um bloco
`question` — **não** `execute_handler` (esse é só pra resposta do return_url). Com
o formato errado o Kommo aceita salvar mas **nunca dispara o POST**.
```js
onSalesbotDesignerSave: function (handler_code, params) {
  return JSON.stringify([
    { question: [
        { handler: "widget_request",
          params: { url: (params && params.url) || DEFAULT_URL,
                    data: { phone: "{{contact.phone}}", message: "{{message_text}}" } } }
    ] }
  ]);
}
```

### Build do zip
```bash
cd kommo-widget && zip -qr -X ../kommo-widget.zip manifest.json script.js i18n images -x ".*"
```

### Upload + ativação (no Kommo)
1. Configurações → Integrações → a integração privada → **Fazer upload de integração** (`.zip`).
2. Abra o widget → **Instalar** → na tela de config deixe a URL em branco (usa o
   default) → **Salvar** → status **Instalado**.
3. **Importante (re-deploy de mudança no widget):** o código do passo é "congelado"
   quando o bot é salvo. Re-subir o widget **não** atualiza um passo já salvo —
   tem que **remover e re-adicionar** o passo do widget no bot.

---

## 3. Contrato do `widget_request` (o que o Kommo envia)

**Content-Type: `application/x-www-form-urlencoded`** — **NÃO é JSON** (esse foi o
400 silencioso). Corpo:
```
token=<JWT>&data%5Bphone%5D=<tel>&data%5Bmessage%5D=<texto>&return_url=<url>
```
- `data[phone]` — **costuma vir VAZIO** em contato de WhatsApp (o macro
  `{{contact.phone}}` não resolve). → resolvemos via API (ver §5).
- `data[message]` — o texto do cliente (o macro `{{message_text}}` resolve ok).
- `return_url` — endpoint **autenticado** `/api/v4/salesbot/{bot}/continue/{id}`.
- `token` — JWT do request (ver §4).

O cérebro lê o corpo com `parseBody()` (tenta JSON, cai pra form-urlencoded
reconstruindo `data[...]`).

---

## 4. JWT do `widget_request`

- **Algoritmo: `HS512`** (não HS256). Aceitar HS256/384/512.
- Assinatura: **HMAC com o `KOMMO_CLIENT_SECRET`** sobre `header.payload`.
- **`aud` = a URL do widget** (`https://crm.credios.com.br`), **não** o client_id —
  não comparar `aud` com client_id (dava 401).
- Quem identifica a integração é **`client_uuid`** (== `KOMMO_CLIENT_ID`).
- `exp`/`iat`/`nbf` vêm como **float** (segundos).
- Claims úteis: `entity_type` (`"1"`=contato, `"2"`=lead), `entity_id`, `account_id`.

`verifyKommoToken()` valida assinatura + `client_uuid` + `exp`.

---

## 5. Telefone vazio → resolução via API

Como `data[phone]` chega vazio, o cérebro busca o telefone na API do Kommo usando
o `entity_id` do JWT (`phoneFromKommo()`):
- `entity_type "2"` (lead): `GET /api/v4/leads/{id}?with=contacts` → contato principal.
- `GET /api/v4/contacts/{id}` → campo `custom_fields_values[field_code=PHONE]`.

Precisa do `KOMMO_TOKEN` (long-lived) válido. Depois, `acharLead()` casa pelo
**últimos 8 dígitos** do telefone com `leads.whatsapp` (lead mais recente).

---

## 6. Continuação (return_url) — injetar a mensagem

A `return_url` é um endpoint **`/api/v4` autenticado** → **precisa do
`Authorization: Bearer <KOMMO_TOKEN>`** (sem isso, 401 e o Kommo re-tenta o
widget_request várias vezes — sintoma: POSTs idênticos repetidos nos logs).

Corpo da continuação:
```json
{ "data": { "handled": true },
  "execute_handlers": [ { "handler": "show", "params": { "type": "text", "value": "<bolha>" } } ] }
```
- Handlers disponíveis na continuação: **só `show` e `goto`**.
- **`show.params.value` tem limite de 80 caracteres** (erro `TooLong` se passar).
  → mandamos a resposta em **bolhas curtas** (um `show` por bolha; link do portal
  numa bolha própria, ~77 chars).

### Mensagem longa / conversa natural (Fase B)
Pra mensagem única e longa (sem o teto de 80), o caminho é o **passo nativo
"Enviar mensagem"** do Salesbot (não tem limite): o cérebro devolve o texto como
**dado** e o passo nativo referencia essa variável. É a única peça que ainda exige
1 setup no Kommo; depois, todo o texto é controlado pelo servidor.

---

## 7. O Salesbot "Receptivo IA"

- **Gatilho:** "Quando o chat é iniciado por mensagem de entrada" (qualquer nova
  conversa). Horário **sempre** (24h). Condição: lead **sem a tag `bot_atendeu`**
  (trava de "uma vez por cliente" na Fase A).
- **Passos:** 1) Widget "Atendimento Credios (IA)" → 2) Adicionar tag `bot_atendeu`
  **no lead** → 3) Mudar etapa ("Encaminhado a…") → 4) Parar robô.
- A tag tem que ser aplicada **no lead** (o gatilho filtra tag de lead) e a grafia
  tem que ser **idêntica** à do gatilho.

### Gotchas de teste (estado preso)
- "Qualquer nova conversa" **não re-dispara** pra um contato com conversa já aberta.
  Re-testar com o mesmo número trava.
- **Reset à prova de bala:** apagar o **contato** no Kommo (zera leads, tags,
  sessões e a conversa volta a ser "nova") e mandar a mensagem de novo.
- Confirmar **0 sessões ativas** no bot antes de testar.

---

## 8. Variáveis de ambiente (Vercel — Production)

| Var | O que é |
|---|---|
| `KOMMO_CLIENT_ID` | UUID da integração do **widget** (== `client_uuid` do JWT). |
| `KOMMO_CLIENT_SECRET` | Secret da integração do widget (valida a **assinatura** do JWT). |
| `KOMMO_SUBDOMAIN` | `credios` (base da API: `https://credios.kommo.com`). |
| `KOMMO_TOKEN` | **Long-lived token** p/ a API (resolver telefone + autenticar a continuação). |

> Env var só entra numa deploy **no momento do deploy** — ao alterar, **redeploy**.

### Gerar o long-lived token
- Configurações → Integrações → integração privada → aba **Chaves e escopos** →
  **Gerar token de longa duração** (validade até 5 anos) → copiar (só aparece 1×).
- **A "URL de redirecionamento" tem que estar VAZIA** — senão a integração entra em
  modo OAuth ("Autorização") e o botão de token não aparece.
- Pode ser uma **integração separada** só pra API (não precisa ser a do widget); o
  token é a nível de conta, com escopo `crm`.

---

## 9. Configurações do Kommo que importam

- **Encurtar links (`kommo.cc`):** Configurações → **Chats e Mensageiros** →
  desligar **"Encurtar links"** pra os links aparecerem no domínio da Credios
  (`crm.credios.com.br/...`) em vez de `kommo.cc/...`.
- **Templates WABA:** aprovados na categoria *Utility* (ex.: `proposta_recebida_confirmar`)
  — usados na **Fase C (proativo)**, fora da janela de 24h.
- Fuso da conta: São Paulo. Horário comercial: seg–sex, 08–17h.

---

## 10. Código no nosso lado

- `src/app/api/kommo/brain/route.ts` — o cérebro (parseBody, verifyKommoToken,
  phoneFromKommo, acharLead, montarResposta, continuação).
- `src/lib/supabase/middleware.ts` — `/api/kommo` no allowlist (gate é o JWT).
- `kommo-widget/` — fontes do widget.

### Debug — puxar logs do cérebro
```bash
npx vercel logs crm.credios.com.br --json --since 10m -n 400 \
  | python3 -c "import json,sys; [print(o.get('responseStatusCode'), m.get('message')) \
      for l in sys.stdin if l.strip() for o in [json.loads(l)] if 'kommo' in json.dumps(o).lower() \
      for m in (o.get('logs') or [{}])]"
```
O cérebro loga: `content-type` + `raw`, `parsed`, `telefone resolvido`, `lead`,
`return_url resp:` (status da continuação).

---

## 11. Próximas fases

- **Fase B (IA):** Claude no cérebro gerando respostas naturais + qualificação
  (estilo Avanti) + guardrails. Entrega via passo nativo de mensagem (§6) pra sair
  do teto de 80 chars. **Roteamento por estado do lead, tudo server-side:**
  - lead **não encontrado** (`acharLead` null) → link do simulador + intro Credios;
  - lead **desqualificado** (`lead.status` / `lead.motivoDesqualificacao`) → recusa educada;
  - lead **qualificado** → confirma + portal (comportamento atual).
- **Fase C (proativo):** CRM empurra lead pro Kommo + dispara template WABA fora do
  horário comercial.

## 12. Segurança
- Nunca commitar segredos — só nomes das env vars (valores na Vercel).
- **Rotacionar** `KOMMO_CLIENT_SECRET` e `KOMMO_TOKEN` se vazarem (passaram por chat
  durante o desenvolvimento).
