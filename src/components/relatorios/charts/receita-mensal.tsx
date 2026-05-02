"use client";

import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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

import { ChartFrame } from "./chart-frame";
import {
  AXIS_TICK,
  GRID_STROKE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./theme";

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
          <ChartFrame height={280}>
            {({ width, height }) => (
              <ComposedChart data={data} width={width} height={height}>
                <defs>
                  <linearGradient id="rec-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={GRID_STROKE}
                />
                <XAxis
                  dataKey="mes"
                  tickFormatter={(v: string) =>
                    format(parse(v, "yyyy-MM", new Date()), "MMM/yy", {
                      locale: ptBR,
                    })
                  }
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={50}
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
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  cursor={{
                    fill: "color-mix(in oklch, var(--foreground) 4%, transparent)",
                  }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: 11,
                    fontFamily: "var(--font-sans)",
                    paddingTop: 8,
                  }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar
                  dataKey="valorLiberado"
                  fill="url(#rec-bar)"
                  name="valorLiberado"
                  radius={[6, 6, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="comissao"
                  stroke="#d4a351"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#d4a351", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#d4a351", strokeWidth: 0 }}
                  name="comissao"
                />
              </ComposedChart>
            )}
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
}
