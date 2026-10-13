import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EtapaBadge, EtapaProgresso } from "@/components/portal-parceiro/etapa";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { buscarIndicacao } from "@/lib/portal-parceiro/indicacoes";
import { exigirParceiroComContrato } from "@/lib/portal-parceiro/acesso";
import { ETAPA_META } from "@/lib/portal-parceiro/status";
import { PRODUTO_LABEL, type Produto } from "@/lib/produtos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Indicação" };

type Props = { params: Promise<{ id: string }> };

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export default async function IndicacaoPage({ params }: Props) {
  const sessao = await exigirParceiroComContrato();
  const { id } = await params;
  // id malformado ou de outro parceiro → 404 igual (não revela que existe).
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ind = await buscarIndicacao(sessao.parceiroId, id);
  if (!ind) notFound();

  const meta = ETAPA_META[ind.etapa];

  return (
    <>
      <Link href="/portal-parceiro/clientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Meus clientes
      </Link>

      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">{ind.nome}</h1>
        <EtapaBadge etapa={ind.etapa} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Andamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EtapaProgresso etapa={ind.etapa} />
          <p className="text-sm text-muted-foreground">{meta.descricao}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operação</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-y-2 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
              <dt className="text-muted-foreground">Produto</dt>
              <dd>{PRODUTO_LABEL[ind.produto as Produto] ?? ind.produto}</dd>
              <dt className="text-muted-foreground">Crédito solicitado</dt>
              <dd>{ind.valorCreditoCentavos != null ? formatBrlFromCents(ind.valorCreditoCentavos) : "—"}</dd>
              {ind.valorLiberadoCentavos != null && (
                <>
                  <dt className="text-muted-foreground">Crédito liberado</dt>
                  <dd className="font-medium">{formatBrlFromCents(ind.valorLiberadoCentavos)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Local</dt>
              <dd>{[ind.cidade, ind.estado].filter(Boolean).join("/") || "—"}</dd>
              {ind.observacoes && (
                <>
                  <dt className="text-muted-foreground">Suas observações</dt>
                  <dd className="whitespace-pre-wrap">{ind.observacoes}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {[...ind.historico].reverse().map((h, i) => (
                <li key={i} className="border-l-2 border-border pl-3">
                  <p className="text-sm font-medium">{ETAPA_META[h.etapa].label}</p>
                  <p className="text-xs text-muted-foreground">{fmtData.format(h.em)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
