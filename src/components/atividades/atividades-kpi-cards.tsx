"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  ATIVIDADE_TIPO_LABEL,
  type AtividadesKpi,
  type AtividadeTipo,
} from "@/lib/atividades/types";
import { cn } from "@/lib/utils";

type Props = {
  kpis: AtividadesKpi[];
};

// Ordem de exibição dos tipos no breakdown (mais comuns primeiro)
const TIPO_ORDEM: AtividadeTipo[] = [
  "whatsapp",
  "ligacao",
  "email",
  "anotacao",
  "simulacao",
  "contato",
  "documento_recebido",
  "reuniao",
];

export function AtividadesKpiCards({ kpis }: Props) {
  if (kpis.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground italic font-serif">
          Nenhuma atividade registrada no período selecionado.
        </CardContent>
      </Card>
    );
  }

  // Total geral pra "card resumo" no fim
  const totalGeral = kpis.reduce((acc, k) => acc + k.total, 0);
  const porTipoGeral: Partial<Record<AtividadeTipo, number>> = {};
  for (const k of kpis) {
    for (const [tipo, count] of Object.entries(k.porTipo)) {
      porTipoGeral[tipo as AtividadeTipo] =
        (porTipoGeral[tipo as AtividadeTipo] ?? 0) + (count ?? 0);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {kpis.map((k) => (
        <KpiCard
          key={k.consultorId}
          consultor={k.consultorNome}
          total={k.total}
          porTipo={k.porTipo}
        />
      ))}
      {kpis.length > 1 && (
        <KpiCard
          consultor="Total da equipe"
          total={totalGeral}
          porTipo={porTipoGeral}
          highlight
        />
      )}
    </div>
  );
}

function KpiCard({
  consultor,
  total,
  porTipo,
  highlight = false,
}: {
  consultor: string;
  total: number;
  porTipo: Partial<Record<AtividadeTipo, number>>;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        "transition-shadow",
        highlight && "ring-1 ring-primary/30 bg-primary/2",
      )}
    >
      <CardContent className="space-y-2 py-4">
        <div className="space-y-0.5">
          <p
            className={cn(
              "font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle",
              highlight && "text-primary",
            )}
          >
            {consultor}
          </p>
          <p className="font-display text-2xl font-semibold tabular-nums">
            {total}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {total === 1 ? "atividade" : "atividades"}
            </span>
          </p>
        </div>
        <div className="space-y-0.5 border-t border-foreground/8 pt-2 text-xs">
          {TIPO_ORDEM.map((tipo) => {
            const n = porTipo[tipo] ?? 0;
            if (n === 0) return null;
            return (
              <div
                key={tipo}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="text-muted-foreground">
                  {ATIVIDADE_TIPO_LABEL[tipo]}
                </span>
                <span className="font-mono tabular-nums">{n}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
