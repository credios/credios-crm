# Runbook — CRM Credios

Procedimentos operacionais. Setup local: ver [`README.md`](../README.md).

## Adicionar usuário

### Via UI (recomendado)
1. Login como admin → **Configurações → Usuários**.
2. **Convidar usuário** → email + nome + perfil → submit.
3. Supabase envia email com link de signup. Usuário clica → define senha (ou loga via Google se email é Workspace).
4. Trigger `on_auth_user_created` cria `public.users` com `perfil='consultor'` por default. A API de invite imediatamente faz override pro perfil escolhido.

> **Pré-requisito**: SMTP do Supabase configurado. Se não tiver Resend SMTP, Supabase usa SMTP nativo limitado a 4 emails/h em projetos novos. Ver [seção SMTP](#smtp-do-supabase).

### Via SQL (fallback se UI quebrar)
```sql
-- Cria via auth.admin (precisa rodar via service_role; use db/seed.ts como template)
-- Ou: peça pro user logar via Google primeiro (trigger cria public.users com 'consultor'),
-- depois promove:
UPDATE public.users
SET perfil = 'admin', nome = 'Nome do User'
WHERE email = 'novo@credios.com.br';
```

## Forçar reset de 2FA

Usuário admin perdeu acesso ao authenticator e está travado.

### Via UI
**Configurações → Usuários** → editar o usuário → botão **"Forçar reset 2FA"** → confirma.

Próximo login dele: se admin, vai pra `/primeiro-acesso` enrolar TOTP de novo.

### Via SQL
```sql
DELETE FROM auth.mfa_factors WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'usuario@credios.com.br'
);
```

## Webhook não está criando leads

1. **Verifica secret**: header `x-webhook-secret` = `WEBHOOK_SECRET` env. Se mudou, atualiza no site da Credios.
2. **Testa direto**:
   ```bash
   SECRET="$(grep WEBHOOK_SECRET .env.local | cut -d= -f2)"
   curl -X POST http://localhost:3000/api/webhooks/lead \
     -H "x-webhook-secret: $SECRET" -H "content-type: application/json" \
     -d '{"nome":"Teste","whatsapp":"+5547999999999"}'
   ```
   Esperado: `201 { leadId, duplicate: false }`. Se 401 → secret errado. Se 400 → payload inválido (veja `details` no response).
3. **Vê audit log**:
   ```sql
   SELECT acao, metadata, criado_em FROM public.audit_log
   WHERE acao LIKE 'lead_criado%'
   ORDER BY criado_em DESC LIMIT 10;
   ```
4. **Vê tabela idempotência**: se mesmo payload em <60s já bateu, vira `200 { duplicate: true }`. Limpa pra reusar:
   ```sql
   DELETE FROM public.webhook_idempotency WHERE created_at < NOW() - INTERVAL '5 minutes';
   ```

## SLA não está disparando

1. **Em dev**: cron não roda automático. Hit manual:
   ```bash
   curl http://localhost:3000/api/cron/sla-check
   ```
   Resposta esperada: `{ ok, inBusinessHours, candidates, newAlerts }`. Se `inBusinessHours: false`, está fora de 08-18 BRT seg-sex (sem feriados ainda).
2. **Em prod**: ver Vercel Dashboard → Crons → ver últimas execuções e status. Se 401, `CRON_SECRET` env var não está setada.
3. **Forçar candidatos**:
   ```sql
   UPDATE public.leads
   SET status='novo',
       consultor_id='<UUID-ADMIN>',
       atribuido_em = NOW() - INTERVAL '40 minutes'
   WHERE id = '<lead-id>';
   ```
4. **Verifica alerta criado**:
   ```sql
   SELECT id, lead_id, tipo, disparado_em, resolvido_em
   FROM public.sla_alertas
   ORDER BY disparado_em DESC LIMIT 5;
   ```

## Realtime não atualiza UI

1. Replication habilitada nas tabelas?
   ```sql
   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
   ```
   Esperado: `leads`, `interacoes`, `sla_alertas`.
2. Se faltar:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>;
   ```
3. RLS bloqueia events que o user não pode ver (esperado pra consultor).
4. Console do browser: procurar por `[supabase] subscribed` ou erros do canal.

## Aplicar migrations

```bash
npm run db:generate  # depois de editar db/schema.ts
# Revisa o SQL gerado em db/migrations/000X_xxx.sql
npm run db:migrate   # aplica no banco do .env.local
```

Pra mudanças de RLS/triggers/views (não-Drizzle), edita `db/policies.sql` e:
```bash
npm run db:policies  # idempotente (DROP POLICY IF EXISTS)
```

## Rotacionar segredos

### `WEBHOOK_SECRET`
1. Gera novo: `openssl rand -base64 32`
2. Atualiza no Vercel (Production env)
3. Atualiza no site da Credios (Wizard) **antes** de fazer redeploy do CRM
4. Atualiza local em `.env.local`

### `RESEND_API_KEY`
1. Cria nova key no Resend Dashboard
2. Atualiza no Supabase Dashboard → Auth → SMTP Settings → Password
3. Atualiza no Vercel
4. Atualiza local em `.env.local`
5. Revoga key antiga no Resend

### Senha do banco Postgres
1. Supabase Dashboard → Project Settings → Database → Reset password
2. Atualiza `DATABASE_URL` em `.env.local` (URL-encode chars especiais!)
3. Atualiza no Vercel
4. Pode quebrar conexões existentes — restart serviços

## SMTP do Supabase (Resend)

Pra invites e password reset usarem Resend (em vez do SMTP nativo limitado):

1. Resend Dashboard → API Keys → cria key
2. Domínio `credios.com.br` precisa estar **verificado** no Resend (DKIM/SPF)
3. Supabase Dashboard → Authentication → Settings → SMTP Settings:
   - Host: `smtp.resend.com`
   - Port: `587`
   - User: `resend`
   - Pass: `<API key do Resend>`
   - Sender name: `CRM Credios`
   - Sender email: `crm@credios.com.br`
4. Test send no próprio dashboard.

## Popular dados de teste (local)

```bash
SECRET="$(grep WEBHOOK_SECRET .env.local | cut -d= -f2)"
for i in {1..15}; do
  curl -sS -X POST http://localhost:3000/api/webhooks/lead \
    -H "x-webhook-secret: $SECRET" -H "content-type: application/json" \
    -d "{\"nome\":\"Lead Demo $i\",\"whatsapp\":\"+5547900000$i\",\"valor_credito\":$((100000 + RANDOM % 700000)),\"valor_imovel\":$((300000 + RANDOM % 1500000)),\"cidade\":\"Blumenau\",\"estado\":\"SC\",\"tipo_imovel\":\"Casa\",\"origem\":\"$( [ $((RANDOM % 3)) -eq 0 ] && echo Google || echo Indicação )\",\"utm_campaign\":\"campanha-$((RANDOM % 3))\"}" > /dev/null
done
```

Limpa depois:
```sql
DELETE FROM public.leads WHERE nome LIKE 'Lead Demo %';
DELETE FROM public.webhook_idempotency;
```

## Ver logs

### Local (dev)
- Terminal onde `npm run dev` rodando: route handlers e proxy hits aparecem ali
- Browser DevTools → Console: client errors + Sonner toasts

### Produção (Vercel)
- Vercel Dashboard → seu projeto → Logs → Functions/Runtime
- Filtra por path (ex: `/api/webhooks/lead`)
- Logs ficam ~1h em free tier; pra retenção use Sentry ou Logtail

### Supabase
- Dashboard → Logs → Postgres / Auth / Realtime
- Filtra por timestamp + query/event

## Sentry (errors em prod)

**Quando ativar**: depois de deployar pro Vercel.

```bash
npx @sentry/wizard@latest -i nextjs
# Segue prompts: cria projeto Sentry, configura DSN, adiciona instrumentação client+server
```

Adiciona env vars no Vercel:
- `NEXT_PUBLIC_SENTRY_DSN=...`
- `SENTRY_AUTH_TOKEN=...` (pra source maps)

Captura automática:
- Erros não tratados client e server
- API route exceptions
- React error boundaries

Custom: `Sentry.captureException(err)` em catch blocks críticos (ex: webhook).

## Vercel Analytics

**Quando ativar**: depois de deployar.

```bash
npm install @vercel/analytics
```

```tsx
// src/app/layout.tsx
import { Analytics } from '@vercel/analytics/next';
// Adiciona <Analytics /> dentro do <body>
```

Habilitar no Vercel Dashboard → Project → Analytics → Enable.

## Backup

Supabase Pro (necessário pra prod) tira backup diário automático. Free tier não.

Manual export:
```bash
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

Restaurar (cuidado, sobrescreve):
```bash
psql "$DATABASE_URL" < backup-YYYYMMDD.sql
```

## Deploy no Vercel

1. Conecta repo GitHub no Vercel Dashboard
2. Framework: Next.js (auto-detecta)
3. Env vars (Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL` (URL-encoded)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   - `WEBHOOK_SECRET` (gerar novo pra prod)
   - `RESEND_API_KEY`
   - `EMAIL_FROM` / `EMAIL_REPLY_TO`
   - `NEXT_PUBLIC_APP_URL=https://crm.credios.com.br`
   - `CRON_SECRET` (gerar novo)
   - `NODE_ENV=production`
4. Domain: `crm.credios.com.br` → Vercel mostra DNS records pra adicionar (CNAME → cname.vercel-dns.com)
5. Atualiza Supabase Auth → URL Configuration:
   - Site URL: `https://crm.credios.com.br`
   - Redirect URLs: adiciona `https://crm.credios.com.br/auth/callback` e `/recuperar-senha/confirmar`
6. Atualiza Google OAuth Console: authorized JS origins inclui `https://crm.credios.com.br`
7. Atualiza site da Credios pra apontar webhook pra `https://crm.credios.com.br/api/webhooks/lead`
8. Vercel Cron começa a rodar automático (`*/5 * * * *` na sla-check)
