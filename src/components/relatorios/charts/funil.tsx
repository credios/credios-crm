"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import type { FunilRow } from "@/lib/reports/queries";

const STATUS_ORDER = [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
  "fechado",
  "perdido",
  "sem_resposta",
  "desqualificado",
];

const STATUS_COLOR: Record<string, string> = {
  novo: "#3b82f6",
  conversa_inicial: "#06b6d4",
  aguardando_resposta: "#f59e0b",
  aguardando_documentacao: "#fb923c",
  documentacao_enviada: "#6366f1",
  em_negociacao: "#8b5cf6",
  fechado: "#10b981",
  perdido: "#f43f5e",
  sem_resposta: "#71717a",
  desqualificado: "#ef4444",
};

export function FunilChart({ rows }: { rows: FunilRow[] }) {
  const map = new Map(rows.map((r) => [r.status, r.count]));
  const data = STATUS_ORDER.filter((s) => (map.get(s) ?? 0) > 0)
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
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" allowDecimals={false} className="text-xs" />
                <YAxis dataKey="status" type="category" width={140} className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={STATUS_COLOR[d.key] ?? "#71717a"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
