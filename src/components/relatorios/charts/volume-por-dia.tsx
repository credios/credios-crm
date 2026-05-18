"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
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
  /**
   * Rows granulares vindas do server (dia × channel × desqualificado).
   * Toggle/dropdown agregam/filtram CLIENT-SIDE — evita roundtrip e
   * re-render das outras seções do dashboard.
   */
  rows: VolumePorDiaRow[];
  /** Estado inicial do filtro de canal (vem da URL pra bookmarkability). */
  initialCanal?: string;
  /** Estado inicial do toggle "esconder desqualificados". */
  initialExcluirDesq?: boolean;
};

// Sentinela do dropdown
const TODOS = "__todos__";

// Ordem fixa pra render do stack — Paid* primeiro (geram revenue) → AI →
// Organic → Direct/Other. Stack do recharts pega ordem de baixo pra cima.
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

// Tipo dos props que o LabelList content recebe — campos relevantes pro
// posicionamento + payload com a linha de dados completa.
type LabelContentProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: string | number;
  payload?: Record<string, unknown>;
};

export function VolumePorDiaChart({
  rows,
  initialCanal,
  initialExcluirDesq = false,
}: Props) {
  // State local — sem URL state, sem server roundtrip. Toggle é instantâneo.
  // initialCanal/initialExcluirDesq vêm dos searchParams (página passa)
  // pra preservar bookmarkability — mas mudanças subsequentes ficam locais.
  const [selectedCanal, setSelectedCanal] = useState<string | undefined>(initialCanal);
  const [excluirDesq, setExcluirDesq] = useState(initialExcluirDesq);

  const aggregated = useMemo(
    () => aggregate(rows, { selectedCanal, excluirDesq }),
    [rows, selectedCanal, excluirDesq],
  );
  const { channels, totalNoPeriodo } = aggregated;

  // Ordena os canais pra render usando CHANNEL_RENDER_ORDER (fixa).
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

  // Anota cada linha com `__topmost` = canal no topo da pilha visível
  // naquele dia (último canal não-zero na ordem de render). O LabelList em
  // cada Bar verifica se ESTE canal é o topmost — se sim, desenha o total
  // ali; senão, retorna null.
  //
  // Por que não LabelList no último Bar (orderedChannels[N-1])?
  //   - Quando o último canal tem 0 num dia, o Bar não renderiza pra aquele
  //     dia → LabelList ancorado nele desaparece → total some.
  // Por que não Bar marker transparente com value=0?
  //   - Mesmo problema: Recharts pula Bars com value=0, então o LabelList
  //     ancorado também é pulado.
  // A solução robusta é distribuir o LabelList por todos os Bars e cada um
  // saber se é o "dono" do label naquele dia, via payload.__topmost.
  const data = useMemo(() => {
    return aggregated.data.map((row) => {
      let topmost: string | undefined;
      for (const ch of orderedChannels) {
        if (Number(row[ch] ?? 0) > 0) topmost = ch;
      }
      return { ...row, __topmost: topmost };
    });
  }, [aggregated.data, orderedChannels]);

  // Factory pra render do label do total — uma função nomeada por Bar
  // (nome serve de displayName, sai do lint react/display-name). O param
  // é `unknown` porque o tipo do Recharts é amplo demais pra anotar bem;
  // narrowing defensivo dentro do corpo.
  const renderTotalLabel = (channelName: string) => {
    function TotalLabel(raw: unknown) {
      const r = (raw ?? {}) as LabelContentProps;
      const payload = r.payload as
        | { __topmost?: string; __total?: number }
        | undefined;
      if (!payload || payload.__topmost !== channelName) return null;
      const total = Number(payload.__total);
      if (!Number.isFinite(total) || total <= 0) return null;
      const x = Number(r.x ?? 0);
      const y = Number(r.y ?? 0);
      const width = Number(r.width ?? 0);
      return (
        <text
          x={x + width / 2}
          y={y - 6}
          textAnchor="middle"
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono, monospace)",
            fontWeight: 600,
            fill: "var(--foreground)",
          }}
        >
          {total}
        </text>
      );
    }
    return TotalLabel;
  };

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
              aria-label="Esconder leads desqualificados"
            />
            Esconder desqualificados
          </label>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Canal</Label>
            <Select
              value={selectedCanal ?? TODOS}
              onValueChange={(v) =>
                setSelectedCanal(v && v !== TODOS ? v : undefined)
              }
            >
              <SelectTrigger className="h-8 w-44">
                {/* children explícito sobrescreve o display do Radix —
                    garante que mostra "Todos" mesmo se a resolução do
                    ItemText falhar (timing de portal, hidratação, etc).
                    Antes: placeholder não disparava porque value=TODOS
                    é uma string non-empty → Radix tentava resolver o
                    ItemText e mostrava o valor cru `__todos__`. */}
                <SelectValue>{selectedCanal ?? "Todos"}</SelectValue>
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
                data={data}
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
                  // Esconde keys internas (__total, __topmost) do tooltip.
                  formatter={(value, name) => {
                    if (typeof name === "string" && name.startsWith("__")) {
                      return ["", ""];
                    }
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
                    radius={i === orderedChannels.length - 1 ? [4, 4, 0, 0] : 0}
                  >
                    {/* LabelList em CADA Bar — só renderiza o total quando
                        ESTE canal é o topo da pilha visível naquele dia
                        (via payload.__topmost). Garante que o label aparece
                        sempre, em qualquer Bar do stack. */}
                    <LabelList
                      dataKey="__total"
                      content={renderTotalLabel(ch)}
                    />
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

// ============================================================================
// Agregação client-side
// ============================================================================
// Recebe rows granulares (dia × channel × desqualificado) e produz a
// estrutura que o BarChart espera (linha por dia, coluna por channel +
// `__total` pro label). O campo `__topmost` é anotado depois no componente,
// pq depende da ordem de render dos canais (orderedChannels).

function aggregate(
  rows: VolumePorDiaRow[],
  opts: { selectedCanal?: string; excluirDesq: boolean },
): {
  data: Array<Record<string, string | number>>;
  channels: string[];
  totalNoPeriodo: number;
} {
  const days = new Map<string, Record<string, number>>();
  const channels = new Set<string>();
  let totalNoPeriodo = 0;

  for (const r of rows) {
    if (opts.excluirDesq && r.desqualificado) continue;
    if (opts.selectedCanal && r.channel !== opts.selectedCanal) continue;

    if (!days.has(r.dia)) days.set(r.dia, {});
    const dayRow = days.get(r.dia)!;
    dayRow[r.channel] = (dayRow[r.channel] ?? 0) + r.count;
    channels.add(r.channel);
    totalNoPeriodo += r.count;
  }

  // Preenche canais ausentes com 0 e adiciona __total agregado por dia.
  const sorted = Array.from(days.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, dayRow]) => {
      const out: Record<string, string | number> = { dia };
      let total = 0;
      for (const c of channels) {
        const v = dayRow[c] ?? 0;
        out[c] = v;
        total += v;
      }
      out.__total = total;
      return out;
    });

  return { data: sorted, channels: Array.from(channels), totalNoPeriodo };
}
