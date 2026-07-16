import { Handshake, MessageCircle } from "lucide-react";
import Link from "next/link";

import { ParceiroStatusBadge } from "@/components/parceiros/parceiro-status-badge";
import type { ParceiroMesaItem } from "@/lib/parceiros/mesa";
import {
  PARCEIRO_SEGMENTO_LABEL,
  type ParceiroSegmento,
} from "@/lib/parceiros/constants";

// Bloco de parceiros na Mesa. Dois usos:
//   - variant="triagem" (admin): candidatos sem dono aguardando decisão
//   - variant="atencao": parceiros do consultor precisando de ação
// Some sozinho quando vazio — a Mesa só mostra o que precisa de gente.

export function BlocoParceiros({
  items,
  variant,
  readOnly = false,
}: {
  items: ParceiroMesaItem[];
  variant: "triagem" | "atencao";
  readOnly?: boolean;
}) {
  if (items.length === 0) return null;

  const titulo =
    variant === "triagem"
      ? "Candidatos a parceiro — triagem"
      : "Parceiros precisando de atenção";
  const cor =
    variant === "triagem" ? "border-l-amber-400" : "border-l-sky-400";

  return (
    <section className={`surface-solid rounded-xl border-l-4 ${cor} p-4`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Handshake className="size-4 text-muted-foreground" />
        {titulo}
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
          {items.length}
        </span>
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((p) => {
          const waDigits = p.whatsapp?.replace(/\D/g, "");
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-background/60 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/parceiros/${p.id}`}
                  prefetch={false}
                  className="font-medium hover:underline"
                >
                  {p.nome}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {[
                    p.segmento
                      ? (PARCEIRO_SEGMENTO_LABEL[p.segmento as ParceiroSegmento] ?? p.segmento)
                      : null,
                    p.empresa,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="block text-xs text-muted-foreground">{p.motivo}</span>
              </div>
              <ParceiroStatusBadge status={p.status} className="shrink-0" />
              {!readOnly && waDigits && (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                >
                  <MessageCircle className="size-3.5 text-emerald-600" /> Chamar
                </a>
              )}
              <Link
                href={`/parceiros/${p.id}`}
                prefetch={false}
                className="shrink-0 text-xs font-medium text-primary hover:underline"
              >
                {variant === "triagem" ? "Fazer triagem" : "Abrir"}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
