"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
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

import { ChartFrame } from "./chart-frame";
import {
  STATUS_COLOR,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./theme";

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
          <ChartFrame height={280}>
            {({ width, height }) => (
              <PieChart width={width} height={height}>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {data.map((d) => (
                    <Cell
                      key={d.key}
                      fill={STATUS_COLOR[d.key] ?? "#6e7891"}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name, item) => {
                    const v = Number(value);
                    const payload = (item as { payload?: { valorCentavos?: number } } | undefined)?.payload;
                    const valorCent = payload?.valorCentavos ?? 0;
                    return [
                      hideValue
                        ? `${v} leads`
                        : `${v} leads · ${formatBrlShort(valorCent)}`,
                      String(name),
                    ];
                  }}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
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
              </PieChart>
            )}
          </ChartFrame>
        )}
      </CardContent>
    </Card>
  );
}
