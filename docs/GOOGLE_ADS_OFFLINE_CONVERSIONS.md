# Google Ads — Offline Conversion Tracking (via Data Manager API)

Envio de conversões de qualidade ao Google Ads para o Smart Bidding otimizar por
leads que avançam no funil e por valor de negócio — não pelo lead mais barato do
simulador.

> ⚠️ **Mudança de API (jun/2026):** o método legado da Google Ads API
> (`ConversionUploadService.UploadClickConversions`) foi **bloqueado para
> integrações novas** e será desligado em **15/06/2026**. Esta integração usa a
> **Data Manager API** (`POST https://datamanager.googleapis.com/v1/events:ingest`),
> que é o caminho oficial atual.

## Visão geral do fluxo

1. **Captura** — o webhook `/api/webhooks/lead` já grava `gclid/wbraid/gbraid`
   e `utm_*` em `leads`. (A captura na LP é do repo do **site**, não deste CRM.)
2. **Disparo** — ao mudar o status do lead (`/api/leads/[id]/status`), o hook
   `onLeadStageChange` (em `after()`, não bloqueia a resposta) decide o evento:
   - entra em `em_negociacao` (ou pula direto pra `fechado`) → **Lead Qualificado**;
   - entra em `fechado` → **Negócio Fechado**;
   - entra em `desqualificado` → marca `retract_unsupported` (ver Retração).
3. **Persistência + idempotência** — cada evento vira uma linha em
   `google_ads_conversions` com `UNIQUE(lead_id, conversion_action)`. Nunca
   reenvia o mesmo evento. O `transactionId` (= lead_id) também deduplica do
   lado do Google.
4. **Upload** — `client.ts` troca o refresh token por access token e faz POST no
   `events:ingest` (RFC3339 UTC no `eventTimestamp`, `conversionValue`+`currency`
   no evento, `adIdentifiers.gclid`).
5. **Retry** — o cron `/api/cron/google-ads-retry` (a cada 15 min) reprocessa
   `pending`/`failed` até `MAX_ATTEMPTS` (8).

## Retração (limitação atual do Google)

A Data Manager API (`events:ingest`) **não tem** método de retrair/ajustar
conversões já enviadas. Quando um lead qualificado vira `desqualificado`, não há
como remover o sinal: a linha é marcada `retract_unsupported` (auditoria), sem
chamada de API. `perdido` não retrai (o lead era qualificado de verdade).
Revisitar quando/se o Google adicionar ajustes à Data Manager API.

## Modelo de valor (`src/lib/google-ads/value.ts`)

Por-lead, em centavos:

- **Qualificado** = `valor_credito × 5% (success fee) × 5% (taxa de fechamento
  esperada dos qualificados)`. Fallback ticket médio R$ 500k quando faltar.
- **Fechado** = comissão real (`comissaoCentavos`); fallback = valor liberado ×
  success fee.

> ⚠️ Fase 1: percentuais são estimativas. Ajustar em `value.ts` (arquivo único).

## Conta, MCC e credenciais

- A conta Credios **`7089773939`** é acessível **diretamente** pelo usuário
  OAuth. O MCC `6693819042` **não gerencia** essa conta → `login_customer_id`
  fica **vazio** (passá-lo dá `USER_PERMISSION_DENIED`). Se um dia a conta for
  movida pra dentro do MCC, basta setar `GADS_LOGIN_CUSTOMER_ID`.
- As 2 ações de conversão vivem **na conta** (não no MCC), tipo upload/GCLID,
  90 dias, secundárias (observação):
  - Lead Qualificado (Em Negociação) → `customers/7089773939/conversionActions/7663484766`
  - Negócio Fechado → `customers/7089773939/conversionActions/7663484769`

## Variáveis de ambiente

| Var | Uso |
|---|---|
| `GADS_CLIENT_ID` / `GADS_CLIENT_SECRET` | OAuth client (Cloud Console) |
| `GADS_REFRESH_TOKEN` | escopo **`datamanager`** — `npx tsx scripts/gerar-refresh-token.ts` |
| `GADS_CUSTOMER_ID` | `operatingAccount.accountId` (= 7089773939) |
| `GADS_ACTION_QUALIFIED` / `GADS_ACTION_CLOSED` | resource name ou ID da ação (vira `productDestinationId`) |
| `GADS_VALIDATE_ONLY` | `"true"` = dry-run (valida sem gravar) |
| `GADS_LOGIN_CUSTOMER_ID` | **vazio** (só se a conta passar a ser gerenciada por MCC) |
| `GADS_DEVELOPER_TOKEN` | **não usado** pela Data Manager API; mantido p/ gestão de ações via Google Ads API |

Se faltar qualquer credencial essencial (`isGoogleAdsEnabled()`), todo o fluxo
vira no-op silencioso — seguro pra rodar antes do go-live.

## Setup (one-time)

1. Habilitar a **Data Manager API** no projeto do Cloud (`credios-ads-api`).
2. Gerar o refresh token (escopo datamanager):
   `GADS_CLIENT_ID=... GADS_CLIENT_SECRET=... npx tsx scripts/gerar-refresh-token.ts`
3. Aplicar a migration: `npm run db:migrate`.
4. Setar as vars no Vercel (Settings → Env Vars).

## Validação (Parte 12 do plano)

1. `GADS_VALIDATE_ONLY=true` → valida payload + auth + ação sem gravar.
2. Lead real com GCLID real até `aguardando_documentacao` → conferir em Google
   Ads → Conversões (24-48h). Status: "Sem conversões" → "Gravando conversões".
3. Monitorar 2 semanas: taxa de upload OK, rejeições por janela (90 dias), e
   divergência qualificados-no-CRM vs conversões-no-Ads.

## Faseamento (config no Google Ads, manual)

- **Fase 1:** as 2 ações ficam Secundárias (observação). Lance segue no
  `Lead - Simulador`. Acumular dados.
- **Fase 2** (~4-6 semanas, 15+ qualificados/mês): lance por **Lead Qualificado**.
- **Fase 3** (com histórico de fechados): **Maximizar Valor de Conversão** com
  **Negócio Fechado**.

## Observação (fora de escopo)

Os adapters `src/lib/capi/` (Meta/TikTok/LinkedIn) só disparam `lead_created` no
webhook — `lead_qualified`/`lead_closed` nunca são enviados pra eles. Decidiu-se
manter só o Google nesta entrega.
