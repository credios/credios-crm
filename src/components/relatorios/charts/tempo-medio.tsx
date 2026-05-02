"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import type { TempoMedioRow } from "@/lib/reports/queries";

export function TempoMedioChart({ rows }: { rows: TempoMedioRow[] }) {
  const data = rows
    .map((r) => ({
      status: STATUS_LEAD_LABEL[r.status] ?? r.status,
      horas: Number(r.horasMedias.toFixed(1)),
      transicoes: r.transicoes,
    }))
    .sort((a, b) => b.horas - a.horas);

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
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" tickFormatter={(v) => `${v}h`} />
                <YAxis dataKey="status" type="category" width={140} className="text-xs" />
                <Tooltip
                  formatter={(value, name) =>
                    name === "horas"
                      ? [`${Number(value)} h`, "Tempo médio"]
                      : [String(value), String(name)]
                  }
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="horas" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
