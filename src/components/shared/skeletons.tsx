/**
 * Skeletons compartilhados — placeholders durante streaming/loading.
 *
 * Princípios:
 *  - Match aproximado do layout real pra evitar reflow visível ao hidratar.
 *  - `animate-pulse` único no wrapper, não em cada filho (perf + visual).
 *  - Nenhum texto/ícone — só formas. Acessível: `aria-hidden + role="status"`
 *    no container externo dos consumers (loading.tsx faz isso).
 *  - Sem animação muito chamativa: pulse padrão do Tailwind é discreto.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ============================================================================
// Bloco genérico
// ============================================================================

export function SkeletonBlock({
  className,
  ...rest
}: React.ComponentProps<"div">) {
  return <Skeleton className={cn("h-4 w-full", className)} {...rest} />;
}

// ============================================================================
// Lista de leads (tabela desktop)
// ============================================================================

export function SkeletonLeadList({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {/* filtros (busca + selects) */}
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>

      {/* toolbar */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Linhas tabela (desktop) */}
      <div className="surface-solid rounded-xl overflow-hidden p-0 hidden md:block">
        <div className="border-b border-foreground/8 px-3 py-2.5">
          <Skeleton className="h-3 w-24" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-3 border-t border-foreground/5"
          >
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Cards mobile */}
      <ul className="space-y-2 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="surface-solid block rounded-xl p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-5 w-24" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="size-5 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Detalhe do lead — header + cards de seções + timeline
// ============================================================================

export function SkeletonLeadDetail() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="surface-solid rounded-2xl p-6 space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-7 w-40" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <SectionCardSkeleton key={i} fields={4} />
          ))}
        </div>
        <SkeletonTimeline items={4} />
      </div>
    </div>
  );
}

function SectionCardSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="surface-solid rounded-xl p-5 space-y-4">
      <Skeleton className="h-5 w-32" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Timeline
// ============================================================================

export function SkeletonTimeline({ items = 5 }: { items?: number }) {
  return (
    <div className="surface-solid rounded-xl p-5 space-y-4">
      <Skeleton className="h-5 w-24" />
      <ul className="relative space-y-4 before:absolute before:left-[13px] before:top-2 before:bottom-2 before:w-px before:bg-foreground/10">
        {Array.from({ length: items }).map((_, i) => (
          <li key={i} className="flex gap-3">
            <Skeleton className="size-7 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5 pt-1">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Bancos parceiros do lead
// ============================================================================

export function SkeletonLeadBancos() {
  return (
    <div className="surface-solid rounded-xl p-5 space-y-3">
      <Skeleton className="h-5 w-44" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 border-t border-foreground/5 pt-2"
        >
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Tarefas — toolbar + cards
// ============================================================================

export function SkeletonTarefas({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* stats cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      {/* lista */}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="surface-solid flex items-center gap-3 rounded-lg p-3"
          >
            <Skeleton className="size-5 rounded" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Relatórios — KPIs + charts
// ============================================================================

export function SkeletonRelatorios() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />

      {/* filtros */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface-solid rounded-xl p-4 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      {/* charts (2 col) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface-solid rounded-xl p-5 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-64 w-full mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Kanban — esqueleto de colunas
// ============================================================================

export function SkeletonKanban({
  columns = 6,
  cardsPerColumn = 4,
}: {
  columns?: number;
  cardsPerColumn?: number;
}) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-h-[60vh]">
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="surface-frosted w-72 shrink-0 rounded-lg overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-foreground/8">
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="p-1.5 space-y-1.5">
                {Array.from({ length: cardsPerColumn }).map((_, i) => (
                  <div
                    key={i}
                    className="surface-solid space-y-1.5 rounded-md p-2.5"
                  >
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-20" />
                    <div className="flex justify-between items-center pt-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="size-5 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
