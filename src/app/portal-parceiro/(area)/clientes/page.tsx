import { Plus } from "lucide-react";
import Link from "next/link";

import { EtapaBadge } from "@/components/portal-parceiro/etapa";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { listarIndicacoes } from "@/lib/portal-parceiro/indicacoes";
import { exigirParceiro } from "@/lib/portal-parceiro/sessao";
import { PRODUTO_LABEL_CURTO, type Produto } from "@/lib/produtos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meus clientes" };

type Props = { searchParams: Promise<{ q?: string }> };

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

export default async function ClientesPage({ searchParams }: Props) {
  const sessao = await exigirParceiro();
  const { q } = await searchParams;
  const indicacoes = await listarIndicacoes(sessao.parceiroId, { q });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Meus clientes</h1>
        <Link href="/portal-parceiro/clientes/novo" className={buttonVariants({ className: "gap-1.5" })}>
          <Plus className="size-4" /> Indicar cliente
        </Link>
      </div>

      <form className="max-w-sm" role="search">
        <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por nome" aria-label="Buscar por nome" />
      </form>

      <Card>
        <CardContent className="pt-5">
          {indicacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {q ? "Nenhum cliente encontrado para essa busca." : "Você ainda não indicou nenhum cliente."}
            </p>
          ) : (
            <ul className="divide-y">
              {indicacoes.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/portal-parceiro/clientes/${i.id}`} className="font-medium hover:underline">
                      {i.nome}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {PRODUTO_LABEL_CURTO[i.produto as Produto] ?? i.produto} · indicado em{" "}
                      {fmtData.format(i.criadoEm)}
                    </p>
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {i.valorCreditoCentavos != null ? formatBrlFromCents(i.valorCreditoCentavos) : "—"}
                  </span>
                  <EtapaBadge etapa={i.etapa} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
