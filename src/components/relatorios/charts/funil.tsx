"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import type { FunilRow } from "@/lib/reports/queries";

import { ChartFrame } from "./chart-frame";
import {
  AXIS_TICK,
  GRID_STROKE,
  STATUS_COLOR,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./theme";

const STATUS_ORDER = [
  "novo",
  "aguardando_resposta",
  "conversa_inicial",
  "reuniao_agendada",
  "aguardando_documentacao",
  "documentacao_enviada",
  "aguardando_cadastro",
  "em_negociacao",
  "fechado",
  "perdido",
  "desqualificado",
];

export function FunilChart({ rows }: { rows: FunilRow[] }) {
  const map = new Map(rows.map((r) => [r.status, r.count]));
  // Status custom fora da lista (criados pelo admin) entram no fim em vez
  // de sumir do gráfico.
  const extras = rows
    .map((r) => r.status)
    .filter((st) => !STATUS_ORDER.includes(st));
  const data = [...STATUS_ORDER, ...extras].filter((s) => (map.get(s) ?? 0) > 0)
    .map((s) => ({
      status: STATUS_LEAD_LABEL[s] ?? s,
      key: s,
      count: map.get(s) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Funil de conversão</CardTitle>
        <CardDescription>Quantidade de leads em cada status (no período).</CardDescription>
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
                layout="vertical"
                margin={{ left: 100 }}
                width={width}
                height={height}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke={GRID_STROKE}
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="status"
                  type="category"
                  width={140}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  cursor={{ fill: "color-mix(in oklch, var(--foreground) 4%, transparent)" }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={STATUS_COLOR[d.key] ?? "#6e7891"} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
}
