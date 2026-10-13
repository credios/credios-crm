import { Plus } from "lucide-react";
import Link from "next/link";

import { EtapaBadge } from "@/components/portal-parceiro/etapa";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { listarIndicacoes, resumoDoParceiro } from "@/lib/portal-parceiro/indicacoes";
import { exigirParceiroComContrato } from "@/lib/portal-parceiro/acesso";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const sessao = await exigirParceiroComContrato();
  const [resumo, indicacoes] = await Promise.all([
    resumoDoParceiro(sessao.parceiroId),
    listarIndicacoes(sessao.parceiroId),
  ]);

  const cards = [
    { label: "Indicações", valor: String(resumo.total) },
    { label: "Em andamento", valor: String(resumo.emAndamento) },
    { label: "Créditos liberados", valor: String(resumo.liberadas) },
    { label: "Comissão a receber", valor: formatBrlFromCents(resumo.aReceberCentavos) },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
            Olá, {sessao.nome.split(/\s+/)[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe suas indicações e comissões.
          </p>
        </div>
        <Link href="/portal-parceiro/clientes/novo" className={buttonVariants({ className: "gap-1.5" })}>
          <Plus className="size-4" /> Indicar cliente
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-5">
              <p className="text-2xl font-semibold tabular-nums">{c.valor}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas indicações</CardTitle>
        </CardHeader>
        <CardContent>
          {indicacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não indicou nenhum cliente.
            </p>
          ) : (
            <ul className="divide-y">
              {indicacoes.slice(0, 5).map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <Link href={`/portal-parceiro/clientes/${i.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                    {i.nome}
                  </Link>
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
