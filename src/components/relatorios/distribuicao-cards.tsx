import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBrlShort } from "@/lib/formatters/currency";
import type {
  DistribRow,
  Distribuicoes,
  ValorStat,
} from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

type Props = {
  data: Distribuicoes;
  /** Limita o número de categorias mostradas por dimensão (resto agrupa em "Outros"). */
  topN?: number;
};

const SECTIONS: Array<{
  key: keyof Omit<Distribuicoes, "totalLeads" | "valores">;
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
      <CardContent className="space-y-5">
        <ValoresBlock valores={data.valores} />
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

function ValoresBlock({ valores }: { valores?: Distribuicoes["valores"] }) {
  // Defensivo: entradas antigas do Data Cache (geradas antes do campo
  // `valores` existir) ainda podem chegar aqui sem ele até o TTL expirar.
  // Sem este guard, o render quebra a PÁGINA INTEIRA (o erro borbulha pro
  // error boundary da rota, não é pego pelo renderSection que só envolve o
  // fetch). Ver também o bump da chave de cache em fetchDistribuicoes.
  if (!valores) return null;
  const ITEMS: Array<{ title: string; hint: string; stat: ValorStat }> = [
    {
      title: "Crédito buscado",
      hint: "valor solicitado",
      stat: valores.credito,
    },
    { title: "Valor do imóvel", hint: "garantia", stat: valores.imovel },
    { title: "Renda mensal", hint: "declarada", stat: valores.renda },
  ];
  // Só mostra se houver ao menos um valor preenchido em alguma dimensão.
  if (ITEMS.every((it) => it.stat.n === 0)) return null;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {ITEMS.map((it) => (
          <ValorStatCard
            key={it.title}
            title={it.title}
            hint={it.hint}
            stat={it.stat}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        A <span className="font-medium text-foreground">mediana</span> é o valor
        do cliente típico — não é distorcida por outliers (ex.: um valor digitado
        errado). A média aparece ao lado para referência.
      </p>
    </div>
  );
}

function ValorStatCard({
  title,
  hint,
  stat,
}: {
  title: string;
  hint: string;
  stat: ValorStat;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-foreground/[0.02] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle font-mono">
          {title}
        </h4>
        <span className="text-[10px] text-fg-faint">{hint}</span>
      </div>
      {stat.n === 0 ? (
        <p className="mt-1 text-xs italic text-fg-faint font-serif">sem dados</p>
      ) : (
        <>
          <p className="mt-1 font-display tabular-nums text-xl font-semibold tracking-[-0.02em] text-foreground">
            {formatBrlShort(stat.medianaCentavos)}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              mediana
            </span>
          </p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            média {formatBrlShort(stat.mediaCentavos)} ·{" "}
            <span className="text-fg-faint">{stat.n} c/ valor</span>
          </p>
        </>
      )}
    </div>
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
