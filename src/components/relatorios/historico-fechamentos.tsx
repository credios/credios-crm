import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { formatDateBr } from "@/lib/formatters/date";
import type { FechamentoRow } from "@/lib/reports/queries";

type Props = {
  rows: FechamentoRow[];
  /** Quando true (não-admin), oculta colunas R$ liberado e R$ comissão. */
  hideValor?: boolean;
};

export function HistoricoFechamentos({ rows, hideValor }: Props) {
  if (rows.length === 0) return null;

  const totalLiberado = rows.reduce(
    (s, r) => s + r.valorLiberadoCentavos,
    0,
  );
  const totalComissao = rows.reduce((s, r) => s + r.comissaoCentavos, 0);
  const cicloMedio = Math.round(
    rows.reduce((s, r) => s + r.cicloDias, 0) / rows.length,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Fechamentos no período</CardTitle>
        <CardDescription>
          {rows.length}{" "}
          {rows.length === 1 ? "operação fechada" : "operações fechadas"} ·
          ciclo médio {cicloMedio} dias
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/8 text-left">
                <Th>Data</Th>
                <Th>Lead</Th>
                {!hideValor && <Th>Banco</Th>}
                {!hideValor && <Th align="right">Liberado</Th>}
                {!hideValor && <Th align="right">Comissão</Th>}
                <Th align="right">Ciclo</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.leadId}
                  className="border-b border-foreground/5 transition-colors hover:bg-foreground/3"
                >
                  <td className="px-2 py-2 font-mono tabular-nums text-[12px]">
                    {formatDateBr(r.dataFechamento)}
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={`/leads/${r.leadId}`}
                      className="font-medium hover:underline"
                    >
                      {r.leadNome}
                    </Link>
                  </td>
                  {!hideValor && (
                    <td className="px-2 py-2 text-muted-foreground">
                      {r.bancoAprovador ?? "—"}
                    </td>
                  )}
                  {!hideValor && (
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {formatBrlFromCents(r.valorLiberadoCentavos)}
                    </td>
                  )}
                  {!hideValor && (
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-foreground">
                      {formatBrlFromCents(r.comissaoCentavos)}
                    </td>
                  )}
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {r.cicloDias}d
                  </td>
                </tr>
              ))}
            </tbody>
            {!hideValor && (
              <tfoot>
                <tr className="border-t border-foreground/15 bg-foreground/3 font-medium">
                  <td colSpan={3} className="px-2 py-2.5 text-right text-xs uppercase tracking-wider text-fg-subtle">
                    Total
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                    {formatBrlFromCents(totalLiberado)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                    {formatBrlFromCents(totalComissao)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className={`px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle${
        align === "right" ? " text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}
