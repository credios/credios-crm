"use client";

import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBrlShort } from "@/lib/formatters/currency";
import type { ReceitaMensalRow } from "@/lib/reports/queries";

export function ReceitaMensalChart({ rows }: { rows: ReceitaMensalRow[] }) {
  const data = rows.map((r) => ({
    mes: r.mes,
    valorLiberado: r.valorLiberadoCentavos / 100,
    comissao: r.comissaoCentavos / 100,
    fechados: r.fechadosCount,
  }));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Receita realizada (últimos 12 meses)</CardTitle>
        <CardDescription>
          Comissão (linha) sobreposta ao valor liberado (barras), por mês de fechamento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-12 text-center">
            Sem fechamentos nos últimos 12 meses.
          </p>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="mes"
                  tickFormatter={(v: string) =>
                    format(parse(v, "yyyy-MM", new Date()), "MMM/yy", { locale: ptBR })
                  }
                  className="text-xs"
                />
                <YAxis
                  className="text-xs"
                  tickFormatter={(v: number) =>
                    formatBrlShort(Math.round(v * 100))
                  }
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatBrlShort(Math.round(Number(value) * 100)),
                    name === "valorLiberado" ? "Valor liberado" : "Comissão",
                  ]}
                  labelFormatter={(v) =>
                    typeof v === "string"
                      ? format(parse(v, "yyyy-MM", new Date()), "MMMM 'de' yyyy", {
                          locale: ptBR,
                        })
                      : String(v)
                  }
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="valorLiberado" fill="#10b981" name="valorLiberado" />
                <Line
                  type="monotone"
                  dataKey="comissao"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="comissao"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
