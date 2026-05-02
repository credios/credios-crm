/* eslint-disable react-hooks/incompatible-library */
// useReactTable retorna funções não-memoizáveis — limitação conhecida da lib.
"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { LeadBulkActions } from "./lead-bulk-actions";
import { LeadFilters } from "./lead-filters";
import { MobileLeadCards } from "./mobile-lead-cards";
import { SortPicker } from "./sort-picker";
import { StatusBadge } from "./status-badge";
import { ViewToggle } from "./view-toggle";
import { EmptyState } from "@/components/shared/empty-state";
import { EmptyLeads } from "@/components/shared/illustrations";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { formatRelative, isEsfriando } from "@/lib/formatters/date";
import { formatPhoneBr, whatsappUrl } from "@/lib/formatters/phone";
import type { LeadRow, ListLeadsResult } from "@/lib/leads/list-leads";
import { cn } from "@/lib/utils";

type Props = {
  result: ListLeadsResult;
  consultores: { id: string; nome: string }[];
  origens: string[];
};

export function LeadList({ result, consultores, origens }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const data = result.data;

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedLeads = useMemo(
    () => data.filter((l) => selectedIds.includes(l.id)),
    [data, selectedIds],
  );

  const columns = useMemo<ColumnDef<LeadRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
            aria-label="Selecionar todos"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(v === true)}
            aria-label="Selecionar lead"
          />
        ),
      },
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => {
          const cold = isEsfriando(row.original.ultimoContato);
          return (
            <div className="flex items-center gap-2">
              {row.original.slaAtrasado && (
                <AlertTriangle
                  className="size-4 text-destructive shrink-0"
                  aria-label="SLA: sem primeiro contato há mais de 30min"
                />
              )}
              {!row.original.slaAtrasado && cold && (
                <AlertTriangle
                  className="size-4 text-destructive shrink-0"
                  aria-label="Esfriando: 5+ dias sem contato"
                />
              )}
              <Link
                href={`/leads/${row.original.id}`}
                prefetch={false}
                className={cn(
                  "font-medium hover:underline",
                  cold && "text-destructive",
                )}
              >
                {row.original.nome}
              </Link>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "valorCreditoCentavos",
        header: "Valor buscado",
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-[13px] font-medium">
            {formatBrlFromCents(row.original.valorCreditoCentavos)}
          </span>
        ),
      },
      {
        accessorKey: "whatsapp",
        header: "WhatsApp",
        cell: ({ row }) => {
          const url = whatsappUrl(row.original.whatsapp);
          if (!url) return <span className="text-muted-foreground">—</span>;
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {formatPhoneBr(row.original.whatsapp)}
            </a>
          );
        },
      },
      {
        accessorKey: "origem",
        header: "Origem",
        cell: ({ row }) =>
          row.original.origem ?? <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "consultorNome",
        header: "Consultor",
        cell: ({ row }) =>
          row.original.consultorNome ?? (
            <span className="text-muted-foreground italic">pool</span>
          ),
      },
      {
        accessorKey: "ultimoContato",
        header: "Último contato",
        cell: ({ row }) => {
          const v = row.original.ultimoContato;
          if (!v) return <span className="text-muted-foreground">nunca</span>;
          const cold = isEsfriando(v);
          return (
            <div className="flex items-center gap-1.5">
              <span className={cn(cold && "text-destructive font-medium")}>
                {formatRelative(v)}
              </span>
              {cold && (
                <AlertTriangle
                  className="size-3 text-destructive"
                  aria-label="Esfriando: 5+ dias sem contato"
                />
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Criado",
        cell: ({ row }) => formatRelative(row.original.createdAt),
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => r.id,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    manualPagination: true,
    pageCount: result.pagination.totalPages,
  });

  function goPage(page: number) {
    const newParams = new URLSearchParams(params.toString());
    newParams.set("page", String(page));
    startTransition(() => router.push(`${pathname}?${newParams.toString()}`));
  }

  return (
    <div className="space-y-4">
      <LeadFilters consultores={consultores} origens={origens} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle current="lista" />
        <div className="flex flex-wrap items-center gap-2">
          <SortPicker />
          <Button nativeButton={false} render={<Link href="/leads/novo">+ Novo lead</Link>} />
        </div>
      </div>

      {selectedLeads.length > 0 && (
        <LeadBulkActions
          selectedLeads={selectedLeads}
          consultores={consultores}
          onDone={() => {
            setRowSelection({});
            startTransition(() => router.refresh());
          }}
          onClear={() => setRowSelection({})}
        />
      )}

      <MobileLeadCards
        rows={data}
        emptyAction={
          <Button
            nativeButton={false}
            render={<Link href="/leads/novo">+ Novo lead</Link>}
          />
        }
      />

      <div className="surface-solid rounded-xl overflow-hidden p-0 hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-bg-subtle border-b border-foreground/8 sticky top-0 z-10">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <EmptyState
                      illustration={<EmptyLeads />}
                      title="Nenhum lead encontrado"
                      description="Tente afrouxar os filtros — ou crie o primeiro lead manual da fila."
                      action={
                        <Button
                          nativeButton={false}
                          render={<Link href="/leads/novo">+ Novo lead</Link>}
                        />
                      }
                    />
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="group/row relative border-t border-foreground/5 transition-colors duration-fast hover:bg-foreground/3"
                  >
                    {row.getVisibleCells().map((cell, idx) => (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-3 py-2.5 text-[13px]",
                          idx === 0 &&
                            "relative before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-primary before:opacity-0 group-hover/row:before:opacity-100 before:transition-opacity",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          {result.pagination.total} leads
          {result.pagination.totalPages > 1 && (
            <>
              {" "}
              · página {result.pagination.page} de {result.pagination.totalPages}
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={result.pagination.page <= 1}
            onClick={() => goPage(result.pagination.page - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={result.pagination.page >= result.pagination.totalPages}
            onClick={() => goPage(result.pagination.page + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
