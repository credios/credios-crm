"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import type { VolumePorDiaRow } from "@/lib/reports/queries";

import { ChartFrame } from "./chart-frame";
import {
  AXIS_TICK,
  CHART_COLORS,
  GRID_STROKE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./theme";

type Props = { rows: VolumePorDiaRow[] };

export function VolumePorDiaChart({ rows }: Props) {
  const { data, origens } = pivot(rows);
  // Number.isFinite garante que NaN/undefined nunca poluam o total — o gráfico
  // mostrava "NaN leads no período" quando alguma row chegava com valor
  // inesperado.
  const totalNoPeriodo = data.reduce((acc, d) => {
    let s = 0;
    for (const o of origens) {
      const v = Number(d[o]);
      if (Number.isFinite(v)) s += v;
    }
    return acc + s;
  }, 0);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Leads por dia</CardTitle>
        <CardDescription>
          {totalNoPeriodo} leads no período · barras empilhadas por origem
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-12 text-center">
            Sem dados no período.
          </p>
        ) : (
          <ChartFrame height={280}>
            {({ width, height }) => (
              <BarChart
                data={data}
                barCategoryGap="20%"
                width={width}
                height={height}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={GRID_STROKE}
                />
                <XAxis
                  dataKey="dia"
                  tickFormatter={(v: string) =>
                    format(parseISO(v), "dd/MM", { locale: ptBR })
                  }
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  labelFormatter={(v) =>
                    typeof v === "string"
                      ? format(parseISO(v), "dd 'de' MMM, yyyy", {
                          locale: ptBR,
                        })
                      : String(v)
                  }
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  cursor={{
                    fill: "color-mix(in oklch, var(--foreground) 5%, transparent)",
                  }}
                  // Suprime entradas com valor 0 (legenda vazia poluía)
                  filterNull
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
                {origens.map((o, i) => (
                  <Bar
                    key={o}
                    dataKey={o}
                    stackId="vol"
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    // Radius só na última stack (visual unificado)
                    radius={i === origens.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            )}
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
}

function pivot(rows: VolumePorDiaRow[]): {
  data: Array<Record<string, string | number>>;
  origens: string[];
} {
  const days = new Map<string, Record<string, string | number>>();
  const origens = new Set<string>();
  for (const r of rows) {
    if (!days.has(r.dia)) days.set(r.dia, { dia: r.dia });
    const row = days.get(r.dia)!;
    row[r.origem] = ((row[r.origem] as number) ?? 0) + r.count;
    origens.add(r.origem);
  }
  for (const row of days.values()) {
    for (const o of origens) {
      if (row[o] === undefined) row[o] = 0;
    }
  }
  return {
    data: Array.from(days.values()).sort((a, b) =>
      String(a.dia).localeCompare(String(b.dia)),
    ),
    origens: Array.from(origens).sort(),
  };
}
