import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Agg = {
  proativo_24: number;
  env_24: number;
  entregue_24: number;
  lido_24: number;
  falhou_24: number;
  pend_24: number;
  rec_24: number;
  proativo_7d: number;
  entregue_7d: number;
  falhou_7d: number;
  rec_7d: number;
};

function haQuanto(min: number | null): string {
  if (min == null) return "nunca";
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function taxa(entregue: number, falhou: number): string {
  const tot = entregue + falhou;
  if (tot === 0) return "—";
  return `${Math.round((entregue / tot) * 100)}%`;
}

export default async function WhatsappSaudePage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/sem-permissao");

  const aggRows = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE tipo='whatsapp_enviado' AND (metadata->>'proativo')='true' AND criado_em > now()-interval '24 hours')::int AS proativo_24,
      count(*) FILTER (WHERE tipo='whatsapp_enviado' AND criado_em > now()-interval '24 hours')::int AS env_24,
      count(*) FILTER (WHERE tipo='whatsapp_enviado' AND metadata->>'entrega' IN ('delivered','read') AND criado_em > now()-interval '24 hours')::int AS entregue_24,
      count(*) FILTER (WHERE tipo='whatsapp_enviado' AND metadata->>'entrega'='read' AND criado_em > now()-interval '24 hours')::int AS lido_24,
      count(*) FILTER (WHERE tipo='whatsapp_enviado' AND metadata->>'entrega'='failed' AND criado_em > now()-interval '24 hours')::int AS falhou_24,
      count(*) FILTER (WHERE tipo='whatsapp_enviado' AND metadata->>'wamid' IS NOT NULL AND metadata->>'entrega' IS NULL AND criado_em > now()-interval '24 hours')::int AS pend_24,
      count(*) FILTER (WHERE tipo='whatsapp_recebido' AND criado_em > now()-interval '24 hours')::int AS rec_24,
      count(*) FILTER (WHERE tipo='whatsapp_enviado' AND (metadata->>'proativo')='true' AND criado_em > now()-interval '7 days')::int AS proativo_7d,
      count(*) FILTER (WHERE tipo='whatsapp_enviado' AND metadata->>'entrega' IN ('delivered','read') AND criado_em > now()-interval '7 days')::int AS entregue_7d,
      count(*) FILTER (WHERE tipo='whatsapp_enviado' AND metadata->>'entrega'='failed' AND criado_em > now()-interval '7 days')::int AS falhou_7d,
      count(*) FILTER (WHERE tipo='whatsapp_recebido' AND criado_em > now()-interval '7 days')::int AS rec_7d
    FROM interacoes
    WHERE criado_em > now() - interval '7 days'
  `)) as unknown as Agg[];
  const a = aggRows[0];

  const motivos = (await db.execute(sql`
    SELECT coalesce(metadata->>'entrega_erro','(sem detalhe)') AS motivo, count(*)::int AS n
    FROM interacoes
    WHERE tipo='whatsapp_enviado' AND metadata->>'entrega'='failed' AND criado_em > now()-interval '7 days'
    GROUP BY 1 ORDER BY n DESC LIMIT 8
  `)) as unknown as { motivo: string; n: number }[];

  const markRows = (await db.execute(sql`
    SELECT
      (SELECT round(extract(epoch from (now()-max(criado_em)))/60)::int FROM interacoes WHERE tipo='whatsapp_enviado' AND (metadata->>'proativo')='true') AS min_proativo,
      (SELECT round(extract(epoch from (now()-max(criado_em)))/60)::int FROM interacoes WHERE tipo='whatsapp_enviado') AS min_enviado,
      (SELECT round(extract(epoch from (now()-max(criado_em)))/60)::int FROM interacoes WHERE tipo='whatsapp_recebido') AS min_recebido
  `)) as unknown as { min_proativo: number | null; min_enviado: number | null; min_recebido: number | null }[];
  const m = markRows[0];

  // "Saudável" se houve proativo nas últimas 6h (proxy simples; volume de lead varia).
  const minProativo = m.min_proativo;
  const sinal =
    minProativo == null ? "alerta" : minProativo < 360 ? "ok" : minProativo < 720 ? "atencao" : "alerta";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          Saúde do WhatsApp
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Atendimento automático da Heloísa — envio e entrega em tempo real.
        </p>
      </div>

      {/* Sinal de frescor */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 py-4">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block size-2.5 rounded-full",
                sinal === "ok" && "bg-emerald-500",
                sinal === "atencao" && "bg-amber-500",
                sinal === "alerta" && "bg-red-500",
              )}
            />
            <span className="text-sm font-medium">
              {sinal === "ok"
                ? "Operando normalmente"
                : sinal === "atencao"
                  ? "Sem envios há algumas horas"
                  : "Sem envios há mais de 12h — verifique"}
            </span>
          </div>
          <Marco label="Último proativo" v={haQuanto(minProativo)} />
          <Marco label="Último envio" v={haQuanto(m.min_enviado)} />
          <Marco label="Última resposta de cliente" v={haQuanto(m.min_recebido)} />
        </CardContent>
      </Card>

      {/* KPIs 24h */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Últimas 24 horas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi titulo="Proativos enviados" valor={a.proativo_24} />
          <Kpi titulo="Entregues" valor={a.entregue_24} sub={`${a.lido_24} lidos`} tom="ok" />
          <Kpi titulo="Taxa de entrega" valor={taxa(a.entregue_24, a.falhou_24)} sub="entregue ÷ definitivos" />
          <Kpi titulo="Falhas de entrega" valor={a.falhou_24} tom={a.falhou_24 > 0 ? "alerta" : undefined} />
          <Kpi titulo="Respostas de clientes" valor={a.rec_24} />
        </div>
        {a.pend_24 > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {a.pend_24} mensagem(ns) aguardando confirmação de entrega do Meta (chega em segundos).
          </p>
        )}
      </div>

      {/* KPIs 7 dias */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Últimos 7 dias</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi titulo="Proativos enviados" valor={a.proativo_7d} />
          <Kpi titulo="Entregues" valor={a.entregue_7d} tom="ok" />
          <Kpi titulo="Taxa de entrega" valor={taxa(a.entregue_7d, a.falhou_7d)} />
          <Kpi titulo="Falhas de entrega" valor={a.falhou_7d} tom={a.falhou_7d > 0 ? "alerta" : undefined} />
        </div>
      </div>

      {/* Motivos de falha */}
      {motivos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Motivos de não-entrega (7 dias)</CardTitle>
            <CardDescription>
              Reportados pelo Meta. <strong>131026</strong> = número sem WhatsApp (lead deu telefone
              inválido — vale ligar). Códigos de conta/limite (13104x) indicam problema no Meta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {motivos.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-4 text-sm">
                  <span className="min-w-0 truncate text-muted-foreground">{r.motivo}</span>
                  <span className="shrink-0 font-mono tabular-nums">{r.n}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Rastreamento de entrega ativo desde 28/06/2026 — métricas de entrega só contam mensagens
        enviadas a partir daí. Envio ≠ entrega: o Meta pode aceitar (enviado) e não entregar
        (número inválido, opt-out, etc.). Uma queda real de envio também dispara alerta por e-mail.
      </p>
    </div>
  );
}

function Marco({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{v}</span>
    </div>
  );
}

function Kpi({
  titulo,
  valor,
  sub,
  tom,
}: {
  titulo: string;
  valor: number | string;
  sub?: string;
  tom?: "ok" | "alerta";
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            tom === "ok" && "text-emerald-600 dark:text-emerald-400",
            tom === "alerta" && "text-red-600 dark:text-red-400",
          )}
        >
          {valor}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
