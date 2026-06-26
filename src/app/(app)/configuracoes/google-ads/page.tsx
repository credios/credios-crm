import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { formatDateTimeBr } from "@/lib/formatters/date";
import { getGoogleAdsConversionsOverview } from "@/lib/google-ads/queries";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  qualified: "Lead Qualificado",
  closed: "Negócio Fechado",
};

const STATUS_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "soft-gold" | "outline" }
> = {
  uploaded: { label: "Enviada", variant: "default" },
  pending: { label: "Pendente", variant: "secondary" },
  failed: { label: "Falhou", variant: "destructive" },
  retract_unsupported: { label: "Desqualif. (s/ retração)", variant: "soft-gold" },
};

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default async function GoogleAdsConfigPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/sem-permissao");

  const { totals, byAction, valueUploadedCents, recent } =
    await getGoogleAdsConversionsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          Conversões Google Ads
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Conversões offline enviadas ao Google Ads (Data Manager API). Fonte de
          verdade do lado do CRM — o painel do Google reflete em 24-48h.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Lead Qualificado enviados" value={String(byAction.qualifiedUploaded)} />
        <Kpi label="Negócio Fechado enviados" value={String(byAction.closedUploaded)} />
        <Kpi label="Valor enviado (enviadas)" value={formatBrlFromCents(valueUploadedCents)} />
        <Kpi
          label="Pendentes / Falhas"
          value={`${totals.pending} / ${totals.failed}`}
        />
      </div>

      {totals.failed > 0 && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {totals.failed} conversão(ões) com falha de envio. O cron reprocessa a
          cada 15 min; veja o motivo na coluna “Erro” abaixo.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Data do evento</th>
              <th className="px-3 py-2 font-medium">Lead</th>
              <th className="px-3 py-2 font-medium">Sinal</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">GCLID</th>
              <th className="px-3 py-2 font-medium">Erro</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Nenhuma conversão enviada ainda. Assim que um lead de anúncio
                  entrar em negociação ou fechar, aparece aqui.
                </td>
              </tr>
            )}
            {recent.map((r) => {
              const sm = STATUS_META[r.status] ?? {
                label: r.status,
                variant: "outline" as const,
              };
              return (
                <tr
                  key={r.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                    {formatDateTimeBr(r.conversionAt)}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/leads/${r.leadId}`}
                      className="text-primary hover:underline"
                    >
                      {r.leadNome ?? r.leadId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {ACTION_LABEL[r.conversionAction] ?? r.conversionAction}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={sm.variant}>{sm.label}</Badge>
                    {r.attempts > 1 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {r.attempts}x
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {r.valueCents != null ? formatBrlFromCents(r.valueCents) : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.gclid ? "✓" : "—"}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-muted-foreground" title={r.error ?? undefined}>
                    {r.error ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
