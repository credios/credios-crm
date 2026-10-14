import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ComissaoAcoes } from "@/components/parceiros/comissao-acoes";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { fechadosSemComissao, listarTodasAsComissoes } from "@/lib/parceiros/comissoes";
import { COMISSAO_STATUS_LABEL, type ComissaoStatus } from "@/lib/parceiros/constants";
import { PRODUTO_LABEL_CURTO, type Produto } from "@/lib/produtos";

export const dynamic = "force-dynamic";

const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : null);
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// Comissões de parceiros — visão geral do admin: o que falta registrar
// (caso a caso), o que está a pagar e o que já foi pago.
export default async function ComissoesParceirosPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/sem-permissao");

  const [semComissao, comissoes] = await Promise.all([
    fechadosSemComissao(),
    listarTodasAsComissoes(),
  ]);
  const abertas = comissoes.filter((c) => c.status === "prevista" || c.status === "a_pagar");
  const pagas = comissoes.filter((c) => c.status === "paga");
  const totalAberto = abertas.reduce((s, c) => s + c.valorCentavos, 0);
  const totalPago = pagas.reduce((s, c) => s + c.valorCentavos, 0);
  const dia = hoje();

  const linha = (c: (typeof comissoes)[number]) => {
    const vencida = c.status !== "paga" && !!c.vencimento && c.vencimento < dia;
    return (
      <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            <Link href={`/parceiros/${c.parceiroId}`} className="hover:underline">
              {c.parceiroNome}
            </Link>
            <span className="font-normal text-muted-foreground">
              {" · "}
              {c.leadId ? (
                <Link href={`/leads/${c.leadId}`} className="hover:underline">
                  {c.leadNome}
                </Link>
              ) : (
                (c.descricao ?? "avulsa")
              )}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {c.produto ? `${PRODUTO_LABEL_CURTO[c.produto as Produto] ?? c.produto} · ` : ""}
            {c.percentualBps != null && c.baseCentavos != null
              ? `${(c.percentualBps / 100).toLocaleString("pt-BR")}% sobre ${formatBrlFromCents(c.baseCentavos)}`
              : "valor caso a caso"}
            {c.pagoEm ? ` · paga em ${dataBr(c.pagoEm)}` : ""}
            {!c.pagoEm && c.vencimento ? ` · vence em ${dataBr(c.vencimento)}` : ""}
          </p>
        </div>
        <span className="font-semibold tabular-nums">{formatBrlFromCents(c.valorCentavos)}</span>
        {vencida ? (
          <Badge variant="destructive">Vencida</Badge>
        ) : (
          <Badge variant={c.status === "paga" ? "default" : "outline"}>
            {COMISSAO_STATUS_LABEL[c.status as ComissaoStatus] ?? c.status}
          </Badge>
        )}
        <ComissaoAcoes
          c={{
            id: c.id,
            parceiroId: c.parceiroId,
            status: c.status,
            valorCentavos: c.valorCentavos,
            rotulo: `${c.parceiroNome} · ${c.leadNome ?? c.descricao ?? "comissão"}`,
            pixChave: c.pixChave,
            temComprovante: c.temComprovante,
            temNota: c.temNota,
          }}
        />
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <Link href="/parceiros" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Parceiros
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
            Comissões de parceiros
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Em aberto: <strong className="text-foreground">{formatBrlFromCents(totalAberto)}</strong>
            {" · "}Pago: <strong className="text-foreground">{formatBrlFromCents(totalPago)}</strong>
          </p>
        </div>
        {/* `download`: arquivo gerado por rota de API, não navegação. */}
        <a
          href="/api/parceiros/comissoes/export"
          download
          className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
        >
          <Download className="size-4" /> Exportar CSV
        </a>
      </div>

      {semComissao.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Operações fechadas sem comissão registrada ({semComissao.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-muted-foreground">
              Em CGI a comissão é definida caso a caso: abra o parceiro e registre o valor.
            </p>
            <ul className="divide-y">
              {semComissao.map((l) => (
                <li key={l.leadId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/leads/${l.leadId}`} className="font-medium hover:underline">
                      {l.leadNome}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {PRODUTO_LABEL_CURTO[l.produto as Produto] ?? l.produto} · {l.parceiroNome}
                      {l.dataFechamento ? ` · fechado em ${dataBr(l.dataFechamento)}` : ""}
                    </p>
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {l.valorLiberadoCentavos != null ? formatBrlFromCents(l.valorLiberadoCentavos) : "—"}
                  </span>
                  <Link
                    href={`/parceiros/${l.parceiroId}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Registrar na ficha
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">A pagar ({abertas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {abertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma comissão em aberto.</p>
          ) : (
            <ul className="divide-y">{abertas.map(linha)}</ul>
          )}
        </CardContent>
      </Card>

      {pagas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagas ({pagas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">{pagas.map(linha)}</ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
