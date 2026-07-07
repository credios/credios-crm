"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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
import type { TempoMedioRow } from "@/lib/reports/queries";

import { ChartFrame } from "./chart-frame";
import {
  AXIS_TICK,
  GRID_STROKE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./theme";

// Status NÃO-terminais que devem aparecer SEMPRE no chart, mesmo sem dado
// (mostra "0h sem transições registradas" em vez de sumir).
// Excluído: fechado, perdido, desqualificado (são finais).
const NON_TERMINAL_STATUSES = [
  "novo",
  "aguardando_resposta",
  "conversa_inicial",
  "reuniao_agendada",
  "aguardando_documentacao",
  "documentacao_enviada",
  "aguardando_cadastro",
  "em_negociacao",
] as const;

export function TempoMedioChart({ rows }: { rows: TempoMedioRow[] }) {
  // Lookup das medições recebidas
  const byStatus = new Map(rows.map((r) => [r.status, r]));

  // Sempre renderiza TODOS os não-terminais. Status sem dado vira 0h pra
  // ficar visualmente coerente (não some do gráfico).
  const data = NON_TERMINAL_STATUSES.map((status) => {
    const r = byStatus.get(status);
    return {
      status: STATUS_LEAD_LABEL[status] ?? status,
      horas: r ? Number(r.horasMedias.toFixed(1)) : 0,
      transicoes: r?.transicoes ?? 0,
    };
  }).sort((a, b) => b.horas - a.horas);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tempo médio em cada status</CardTitle>
        <CardDescription>
          Horas entre entrar no status e sair (baseado em mudanças registradas).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-12 text-center">
            Sem transições registradas no período.
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
                <defs>
                  <linearGradient id="tempo-bar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.95} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke={GRID_STROKE}
                />
                <XAxis
                  type="number"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}h`}
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
                  formatter={(value, name) =>
                    name === "horas"
                      ? [`${Number(value)} h`, "Tempo médio"]
                      : [String(value), String(name)]
                  }
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  cursor={{
                    fill: "color-mix(in oklch, var(--foreground) 4%, transparent)",
                  }}
                />
                <Bar dataKey="horas" fill="url(#tempo-bar)" radius={[0, 6, 6, 0]} />
              </BarChart>
            )}
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
}
