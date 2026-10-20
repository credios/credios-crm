import { FileDown } from "lucide-react";
import Link from "next/link";

import { SimulacaoForm } from "@/components/portal-parceiro/simulacao-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { maskCnpj } from "@/lib/formatters/cpf-cnpj";
import { exigirParceiroComContrato } from "@/lib/portal-parceiro/acesso";
import {
  listarSimulacoes,
  podeSimularCondominio,
  resumoCondicoes,
} from "@/lib/portal-parceiro/simulacoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Simular" };

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const pct = (v: number) => v.toFixed(2).replace(".", ",") + "%";

export default async function SimulacoesPage() {
  const sessao = await exigirParceiroComContrato();

  if (!podeSimularCondominio(sessao)) {
    return (
      <>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Simular</h1>
        <p className="text-sm text-muted-foreground">
          A simulação está disponível para parceiros habilitados em crédito para
          condomínio. Fale com a Credios para habilitar.
        </p>
      </>
    );
  }

  const [condicoes, simulacoes] = await Promise.all([
    resumoCondicoes(),
    listarSimulacoes(sessao.parceiroId),
  ]);
  const taxa =
    condicoes.taxaMinAm === condicoes.taxaMaxAm
      ? `${pct(condicoes.taxaMinAm)} a.m.`
      : `${pct(condicoes.taxaMinAm)} a ${pct(condicoes.taxaMaxAm)} a.m.`;

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
          Simular crédito para condomínio
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gere em segundos um PDF com o seu nome para apresentar ao síndico: parcelas
          de {condicoes.prazos.join(", ").replace(/, (\d+)$/, " e $1")} meses, taxa de{" "}
          {taxa}.
        </p>
      </div>

      <SimulacaoForm
        valorMinimo={condicoes.valorMinimo}
        valorMaximo={condicoes.valorMaximo}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Simulações recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {simulacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Você ainda não gerou nenhuma simulação.</p>
          ) : (
            <ul className="divide-y">
              {simulacoes.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.condominioNome}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.codigo} · CNPJ {maskCnpj(s.cnpj)} · {fmtData.format(s.criadoEm)}
                    </p>
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {formatBrlFromCents(s.valorCreditoCentavos)}
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/portal-parceiro/simulacoes/${s.id}/pdf?download=1`}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
                    >
                      <FileDown className="size-4" /> PDF
                    </a>
                    <Link
                      href={`/portal-parceiro/clientes/novo?simulacao=${s.id}`}
                      prefetch={false}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Indicar
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
