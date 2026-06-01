"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "./status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { EmptyLeads } from "@/components/shared/illustrations";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatBrlShort } from "@/lib/formatters/currency";
import {
  creditoTotalBuscadoCentavos,
  temSaldoDevedor,
} from "@/lib/leads/credito-total";
import { formatRelative, isEsfriando } from "@/lib/formatters/date";
import type { LeadRow } from "@/lib/leads/list-leads";
import { cn } from "@/lib/utils";

function initials(nome: string | null): string {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Props = {
  rows: LeadRow[];
  emptyAction?: React.ReactNode;
};

export function MobileLeadCards({ rows, emptyAction }: Props) {
  if (rows.length === 0) {
    return (
      <div className="md:hidden">
        <div className="surface-solid rounded-xl">
          <EmptyState
            illustration={<EmptyLeads />}
            title="Nenhum lead encontrado"
            description="Tente afrouxar os filtros — ou crie o primeiro lead manual."
            action={emptyAction}
          />
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2 md:hidden stagger [&>*]:animate-fade-up">
      {rows.map((lead) => {
        const cold = isEsfriando(lead.ultimoContato);
        return (
          <li key={lead.id}>
            <Link
              href={`/leads/${lead.id}`}
              prefetch={false}
              className={cn(
                "surface-solid block rounded-xl p-3 active:bg-foreground/3 transition-colors",
                (cold || lead.slaAtrasado) &&
                  "ring-1 ring-destructive/40 border-l-[3px] border-l-destructive",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {lead.valoresSuspeitosPendentes && (
                      <AlertTriangle
                        className="size-3.5 text-gold-600 dark:text-gold-400 shrink-0"
                        aria-label="Valores suspeitos"
                        strokeWidth={1.75}
                      />
                    )}
                    {lead.slaAtrasado && (
                      <AlertTriangle
                        className="size-3.5 text-destructive shrink-0"
                        aria-label="SLA"
                        strokeWidth={1.75}
                      />
                    )}
                    {cold && !lead.slaAtrasado && (
                      <AlertTriangle
                        className="size-3.5 text-destructive shrink-0"
                        aria-label="Esfriando: 5+ dias sem contato"
                        strokeWidth={1.75}
                      />
                    )}
                    <p className="text-[15px] font-semibold tracking-[-0.005em] truncate">
                      {lead.nome}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono tabular-nums text-base font-semibold text-foreground">
                      {formatBrlShort(lead.valorCreditoCentavos)}
                    </p>
                    {/* Imóvel financiado: total real da operação
                        (valor buscado + saldo devedor a quitar). */}
                    {temSaldoDevedor(lead.saldoDevedorCentavos) &&
                      lead.valorCreditoCentavos != null && (
                        <p className="font-mono tabular-nums text-[11px] leading-tight text-muted-foreground">
                          total c/ saldo{" "}
                          <span className="font-semibold text-foreground/70">
                            {formatBrlShort(
                              creditoTotalBuscadoCentavos(
                                lead.valorCreditoCentavos,
                                lead.saldoDevedorCentavos,
                              ),
                            )}
                          </span>
                        </p>
                      )}
                  </div>
                </div>
                <StatusBadge status={lead.status} className="shrink-0" />
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 flex-wrap">
                  {lead.origem && (
                    <Badge variant="soft" className="text-[10px]">
                      {lead.origem}
                    </Badge>
                  )}
                  {lead.estado && (
                    <Badge variant="outline" className="text-[10px]">
                      {lead.estado}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                  <span className="font-mono">
                    {lead.ultimoContato
                      ? formatRelative(lead.ultimoContato)
                      : "sem contato"}
                  </span>
                  {lead.consultorNome ? (
                    <Avatar className="size-5 ring-1 ring-foreground/10">
                      <AvatarFallback
                        className="text-[10px]"
                        title={lead.consultorNome}
                      >
                        {initials(lead.consultorNome)}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <span className="font-mono italic">pool</span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
