"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { VolumePorDiaRow } from "@/lib/reports/queries";
import { CHANNELS } from "@/lib/tracking/taxonomy";

import { ChartFrame } from "./chart-frame";
import {
  AXIS_TICK,
  CHANNEL_COLOR,
  GRID_STROKE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from "./theme";

type Props = {
  rows: VolumePorDiaRow[];
  /** Canal atualmente filtrado (vem da URL). undefined = "Todos". */
  selectedCanal?: string;
  /** Se true, query já omitiu leads desqualificados — toggle reflete isso. */
  excluirDesq?: boolean;
};

// Sentinela do dropdown — Select não aceita string vazia como value
const TODOS = "__todos__";

// Ordem fixa pra rendering — canais "Paid" primeiro (geram revenue, são o
// foco do admin), depois "Organic"/AI, depois Direct/Other. Stack do recharts
// usa essa ordem da esquerda pra direita / de baixo pra cima.
const CHANNEL_RENDER_ORDER: string[] = [
  "Paid Search",
  "Paid Social",
  "Paid Video",
  "Paid Display",
  "AI Assistant",
  "Organic Search",
  "Organic Social",
  "Referral",
  "Indicação",
  "Email",
  "Direct",
  "Manual",
  "Sem canal",
];

export function VolumePorDiaChart({
  rows,
  selectedCanal,
  excluirDesq = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const { data, channels, totalPorDia } = useMemo(() => pivot(rows), [rows]);
  const totalNoPeriodo = totalPorDia.reduce((acc, n) => acc + n, 0);

  // Pra coluna `__total` no objeto de dados — guarda o total do dia
  // pra o LabelList usar como dataKey.
  const dataWithTotal = useMemo(
    () =>
      data.map((d, i) => ({
        ...d,
        __total: totalPorDia[i] ?? 0,
      })),
    [data, totalPorDia],
  );

  function setCanal(value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== TODOS) next.set("canal", value);
    else next.delete("canal");
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  function setExcluirDesq(checked: boolean) {
    const next = new URLSearchParams(params.toString());
    if (checked) next.set("excluirDesq", "1");
    else next.delete("excluirDesq");
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  // Ordena os canais pra render usando CHANNEL_RENDER_ORDER (fixa).
  // Channels que não estão na lista fixa (ex: novo canal customizado) caem
  // no fim em ordem alfabética — defensivo.
  const orderedChannels = useMemo(() => {
    const set = new Set(channels);
    const out: string[] = [];
    for (const c of CHANNEL_RENDER_ORDER) {
      if (set.has(c)) {
        out.push(c);
        set.delete(c);
      }
    }
    return [...out, ...Array.from(set).sort()];
  }, [channels]);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base">Leads por dia</CardTitle>
          <CardDescription>
            {totalNoPeriodo} leads no período · barras empilhadas por canal
            {excluirDesq && " · sem desqualificados"}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch
              checked={excluirDesq}
              onCheckedChange={setExcluirDesq}
              aria-label="Excluir leads desqualificados"
            />
            Esconder desqualificados
          </label>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Canal</Label>
            <Select
              value={selectedCanal ?? TODOS}
              onValueChange={(v) => setCanal(v ?? TODOS)}
            >
              <SelectTrigger className="h-8 w-44">
                {/* Render-prop pro SelectValue não mostrar a sentinela
                    "__todos__" literalmente. Value=TODOS → label "Todos". */}
                <SelectValue>
                  {(v: unknown) => {
                    if (typeof v !== "string" || v === TODOS) return "Todos";
                    return v;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-12 text-center">
            Sem dados no período.
          </p>
        ) : (
          <ChartFrame height={300}>
            {({ width, height }) => (
              <BarChart
                data={dataWithTotal}
                barCategoryGap="20%"
                width={width}
                height={height}
                margin={{ top: 24, right: 4, bottom: 4, left: 0 }}
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
                  filterNull
                  // Ignora a coluna `__total` no tooltip (é só pro LabelList).
                  formatter={(value, name) => {
                    if (name === "__total") return ["", ""];
                    return [value, name];
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
                {orderedChannels.map((ch, i) => (
                  <Bar
                    key={ch}
                    dataKey={ch}
                    name={ch}
                    stackId="vol"
                    fill={CHANNEL_COLOR[ch] ?? "#94a3b8"}
                    // Radius só na última stack (visual unificado).
                    // O LabelList vai aplicado APÓS na bar mais alta — daí
                    // o total renderiza acima da pilha inteira.
                    radius={i === orderedChannels.length - 1 ? [4, 4, 0, 0] : 0}
                  >
                    {/* LabelList apenas na última bar da pilha — o `position="top"`
                        renderiza o valor de `__total` (o total do dia) acima.
                        Só uma vez por barra empilhada — não acumula. */}
                    {i === orderedChannels.length - 1 && (
                      <LabelList
                        dataKey="__total"
                        position="top"
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-mono, monospace)",
                          fill: "var(--foreground)",
                          fontWeight: 600,
                        }}
                        formatter={(value: unknown) => {
                          const n = Number(value);
                          return Number.isFinite(n) && n > 0 ? String(n) : "";
                        }}
                      />
                    )}
                  </Bar>
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
  channels: string[];
  totalPorDia: number[];
} {
  const days = new Map<string, Record<string, string | number>>();
  const channels = new Set<string>();
  for (const r of rows) {
    if (!days.has(r.dia)) days.set(r.dia, { dia: r.dia });
    const row = days.get(r.dia)!;
    row[r.channel] = ((row[r.channel] as number) ?? 0) + r.count;
    channels.add(r.channel);
  }
  for (const row of days.values()) {
    for (const c of channels) {
      if (row[c] === undefined) row[c] = 0;
    }
  }
  const sorted = Array.from(days.values()).sort((a, b) =>
    String(a.dia).localeCompare(String(b.dia)),
  );
  const totalPorDia = sorted.map((row) => {
    let total = 0;
    for (const c of channels) {
      const v = Number(row[c]);
      if (Number.isFinite(v)) total += v;
    }
    return total;
  });
  return {
    data: sorted,
    channels: Array.from(channels),
    totalPorDia,
  };
}
