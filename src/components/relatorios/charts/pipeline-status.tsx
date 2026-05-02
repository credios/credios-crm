"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { formatBrlShort } from "@/lib/formatters/currency";
import type { PipelineRow } from "@/lib/reports/queries";

const STATUS_COLOR: Record<string, string> = {
  novo: "#3b82f6",
  conversa_inicial: "#06b6d4",
  aguardando_resposta: "#f59e0b",
  aguardando_documentacao: "#fb923c",
  documentacao_enviada: "#6366f1",
  em_negociacao: "#8b5cf6",
};

type Props = {
  rows: PipelineRow[];
  hideValue?: boolean;
};

export function PipelineStatusChart({ rows, hideValue }: Props) {
  const data = rows.map((r) => ({
    name: STATUS_LEAD_LABEL[r.status] ?? r.status,
    key: r.status,
    value: r.count,
    valorCentavos: r.valorCentavos,
  }));
  const totalCount = data.reduce((s, d) => s + d.value, 0);
  const totalValor = data.reduce((s, d) => s + d.valorCentavos, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pipeline ativo por status</CardTitle>
        <CardDescription>
          {totalCount} leads ativos
          {!hideValue && totalValor > 0 && ` · ${formatBrlShort(totalValor)} em valor buscado`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-12 text-center">
            Sem leads no pipeline ativo.
          </p>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {data.map((d) => (
                    <Cell key={d.key} fill={STATUS_COLOR[d.key] ?? "#71717a"} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name, item) => {
                    const v = Number(value);
                    const payload = (item as { payload?: { valorCentavos?: number } } | undefined)?.payload;
                    const valorCent = payload?.valorCentavos ?? 0;
                    return [
                      hideValue ? `${v} leads` : `${v} leads · ${formatBrlShort(valorCent)}`,
                      String(name),
                    ];
                  }}
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
