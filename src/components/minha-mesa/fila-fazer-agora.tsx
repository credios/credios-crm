"use client";

import { Flame, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CardFazerAgora } from "./card-fazer-agora";
import { Button } from "@/components/ui/button";
import type { FilaItem } from "@/lib/minha-mesa/queries";

type Props = { items: FilaItem[] };

export function FilaFazerAgora({ items }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Itens "resolvidos" (já agiram em cima) somem da lista localmente.
  // O server vai ressincronizar no próximo refresh.
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());

  function marcarResolvido(leadId: string) {
    setResolvidos((prev) => new Set(prev).add(leadId));
    startTransition(() => router.refresh());
  }

  const visiveis = items.filter((i) => !resolvidos.has(i.leadId));

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flame
            className="size-5 text-orange-500"
            strokeWidth={1.75}
            aria-hidden
          />
          <h2 className="font-display text-lg font-semibold">Fazer agora</h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
            {visiveis.length} {visiveis.length === 1 ? "item" : "itens"}
          </span>
        </div>
        {resolvidos.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setResolvidos(new Set());
              startTransition(() => router.refresh());
            }}
          >
            Recarregar fila
          </Button>
        )}
      </header>

      {visiveis.length === 0 ? (
        <div className="surface-solid rounded-xl p-8 text-center space-y-2">
          <Sparkles
            className="mx-auto size-8 text-emerald-500"
            strokeWidth={1.5}
          />
          <p className="font-display text-base font-semibold">
            Tudo limpo por aqui
          </p>
          <p className="font-serif italic text-sm text-muted-foreground">
            Nenhum lead urgente no momento. Ótima hora pra prospectar ou
            adiantar follow-ups.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visiveis.map((item) => (
            <CardFazerAgora
              key={`${item.leadId}-${item.motivoTipo}`}
              item={item}
              onResolved={() => marcarResolvido(item.leadId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
