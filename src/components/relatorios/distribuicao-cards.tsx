import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DistribRow, Distribuicoes } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

type Props = {
  data: Distribuicoes;
  /** Limita o número de categorias mostradas por dimensão (resto agrupa em "Outros"). */
  topN?: number;
};

const SECTIONS: Array<{
  key: keyof Omit<Distribuicoes, "totalLeads">;
  title: string;
  hint: string;
}> = [
  { key: "tipoPessoa", title: "Tipo de pessoa", hint: "PF vs PJ" },
  { key: "objetivoCredito", title: "Objetivo do crédito", hint: "para o que vão usar" },
  { key: "tipoImovel", title: "Tipo de imóvel", hint: "imóvel dado em garantia" },
  { key: "situacaoImovel", title: "Situação do imóvel", hint: "quitado, financiado..." },
  { key: "ocupacao", title: "Ocupação profissional", hint: "CLT, autônomo..." },
  { key: "estadoCivil", title: "Estado civil", hint: "perfil familiar" },
];

export function DistribuicaoCards({ data, topN = 6 }: Props) {
  if (data.totalLeads === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil dos leads</CardTitle>
          <CardDescription>
            Sem leads no período pra agregar.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Perfil dos leads no período
        </CardTitle>
        <CardDescription>
          {data.totalLeads}{" "}
          {data.totalLeads === 1 ? "lead analisado" : "leads analisados"} ·
          quem é o típico cliente que está entrando
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((sec) => (
            <DistribBlock
              key={sec.key}
              title={sec.title}
              hint={sec.hint}
              rows={data[sec.key]}
              topN={topN}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DistribBlock({
  title,
  hint,
  rows,
  topN,
}: {
  title: string;
  hint: string;
  rows: DistribRow[];
  topN: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="space-y-1.5">
        <header>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle font-mono">
            {title}
          </h4>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </header>
        <p className="text-xs italic text-fg-faint font-serif">sem dados</p>
      </div>
    );
  }

  // Top N + agrega o resto
  const top = rows.slice(0, topN);
  const rest = rows.slice(topN);
  const restCount = rest.reduce((s, r) => s + r.count, 0);
  const restPct = rest.reduce((s, r) => s + r.pct, 0);
  if (restCount > 0) {
    top.push({ valor: `Outros (${rest.length})`, count: restCount, pct: restPct });
  }

  // Cores por posição (rank) — usa brand
  const COLOR = [
    "bg-blue-500",
    "bg-gold-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-rose-500",
    "bg-charcoal-300",
    "bg-blue-300",
  ];

  return (
    <div className="space-y-1.5">
      <header className="space-y-0.5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle font-mono">
          {title}
        </h4>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </header>
      <ul className="space-y-1">
        {top.map((r, i) => {
          const pctNum = Math.round(r.pct * 100);
          return (
            <li key={r.valor} className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate">{r.valor}</span>
                <span className="font-mono tabular-nums text-muted-foreground shrink-0">
                  {r.count}{" "}
                  <span className="text-fg-faint">·</span> {pctNum}%
                </span>
              </div>
              <div className="h-1 rounded-full bg-foreground/6 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-base",
                    COLOR[i % COLOR.length],
                  )}
                  style={{ width: `${Math.max(pctNum, 2)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
