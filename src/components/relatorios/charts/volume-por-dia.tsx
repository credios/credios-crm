"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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
import type { VolumePorDiaRow } from "@/lib/reports/queries";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
];

type Props = { rows: VolumePorDiaRow[] };

export function VolumePorDiaChart({ rows }: Props) {
  const { data, origens } = pivot(rows);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Volume de leads por dia</CardTitle>
        <CardDescription>Segmentado por origem (área empilhada).</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-12 text-center">
            Sem dados no período.
          </p>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="dia"
                  tickFormatter={(v: string) => format(parseISO(v), "dd/MM", { locale: ptBR })}
                  className="text-xs"
                />
                <YAxis allowDecimals={false} className="text-xs" />
                <Tooltip
                  labelFormatter={(v) =>
                    typeof v === "string"
                      ? format(parseISO(v), "dd 'de' MMM, yyyy", { locale: ptBR })
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
                {origens.map((o, i) => (
                  <Area
                    key={o}
                    type="monotone"
                    dataKey={o}
                    stackId="1"
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.6}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function pivot(rows: VolumePorDiaRow[]): {
  data: Record<string, string | number>[];
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
  // Ensure each day has 0 for missing origens (for stacked area)
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
