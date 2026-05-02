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

type Props = { rows: ReceitaMensalRow[] };

/**
 * Versão executiva do gráfico de receita: dual axis pra evitar a comissão
 * (1-2% do valor liberado) ficar achatada na escala. Tooltip rico com
 * número de operações e ticket médio.
 */
export function ReceitaMensalExec({ rows }: Props) {
  const data = rows.map((r) => ({
    mes: r.mes,
    valorLiberado: r.valorLiberadoCentavos / 100,
    comissao: r.comissaoCentavos / 100,
    fechados: r.fechadosCount,
    ticketMedio:
      r.fechadosCount > 0 ? r.valorLiberadoCentavos / 100 / r.fechadosCount : 0,
  }));

  const totalLiberado = data.reduce((s, d) => s + d.valorLiberado, 0);
  const totalComissao = data.reduce((s, d) => s + d.comissao, 0);
  const totalFechados = data.reduce((s, d) => s + d.fechados, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Receita realizada — últimos 12 meses
        </CardTitle>
        <CardDescription>
          Barras = R$ liberado (eixo esq.) · linha = R$ comissão (eixo dir.) ·{" "}
          {totalFechados} fechamentos · {formatBrlShort(totalLiberado * 100)}{" "}
          liberado · {formatBrlShort(totalComissao * 100)} comissão
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="font-serif italic text-sm text-muted-foreground py-12 text-center">
            Sem fechamentos nos últimos 12 meses.
          </p>
        ) : (
          <ChartFrame height={340}>
            {({ width, height }) => (
              <ComposedChart
                data={data}
                margin={{ top: 12, right: 24, bottom: 0, left: 0 }}
                width={width}
                height={height}
              >
                <defs>
                  <linearGradient id="rec-bar-exec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.5} />
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
                  yAxisId="liberado"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) =>
                    formatBrlShort(Math.round(v * 100))
                  }
                />
                <YAxis
                  yAxisId="comissao"
                  orientation="right"
                  tick={{ ...AXIS_TICK, fill: "#d4a351" }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) =>
                    formatBrlShort(Math.round(v * 100))
                  }
                />
                <Tooltip
                  formatter={(value, name) => {
                    const v = Number(value);
                    if (name === "fechados") return [`${v} ops`, "Fechamentos"];
                    if (name === "ticketMedio")
                      return [
                        formatBrlShort(Math.round(v * 100)),
                        "Ticket médio",
                      ];
                    return [
                      formatBrlShort(Math.round(v * 100)),
                      name === "valorLiberado" ? "Valor liberado" : "Comissão",
                    ];
                  }}
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
                    paddingTop: 12,
                  }}
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) =>
                    v === "valorLiberado"
                      ? "Valor liberado"
                      : v === "comissao"
                        ? "Comissão"
                        : v
                  }
                />
                <Bar
                  yAxisId="liberado"
                  dataKey="valorLiberado"
                  name="valorLiberado"
                  fill="url(#rec-bar-exec)"
                  radius={[6, 6, 0, 0]}
                  barSize={32}
                />
                <Line
                  yAxisId="comissao"
                  type="monotone"
                  dataKey="comissao"
                  name="comissao"
                  stroke="#d4a351"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#d4a351", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#d4a351", strokeWidth: 0 }}
                />
              </ComposedChart>
            )}
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
}
