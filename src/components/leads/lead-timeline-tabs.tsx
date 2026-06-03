"use client";

import { useState } from "react";

import { LeadAnotacoes, type Anotacao } from "./lead-anotacoes";
import { LeadTimeline, type Interacao } from "./lead-timeline";
import { cn } from "@/lib/utils";

// ============================================================================
// LeadTimelineTabs — abriga as duas visualizações da coluna direita do lead
// ============================================================================
// Tab "Contatos": timeline tradicional (ligações, WhatsApp, email, reunião...)
// Tab "Anotações": notas livres editáveis (dados do cônjuge, contexto, etc.)
//
// Manter UI state local (não persisto preferência) — o consultor abre o lead
// e por default vê Contatos (a tab mais usada no dia a dia).
// ============================================================================

type Props = {
  leadId: string;
  // Contatos (timeline tradicional)
  initialInteracoes: Interacao[];
  canCreateInteracao: boolean;
  mayHaveMoreInteracoes: boolean;
  // Anotações
  initialAnotacoes: Anotacao[];
  canEditAnotacao: boolean;
  canDeleteAnotacao: boolean;
};

export function LeadTimelineTabs({
  leadId,
  initialInteracoes,
  canCreateInteracao,
  mayHaveMoreInteracoes,
  initialAnotacoes,
  canEditAnotacao,
  canDeleteAnotacao,
}: Props) {
  const [tab, setTab] = useState<"contatos" | "anotacoes">("contatos");

  return (
    <div className="space-y-3">
      <div
        className="flex gap-1 rounded-lg border bg-card p-1"
        role="tablist"
        aria-label="Visualização do lead"
      >
        <TabButton
          active={tab === "contatos"}
          onClick={() => setTab("contatos")}
        >
          Contatos & Acontecimentos
        </TabButton>
        <TabButton
          active={tab === "anotacoes"}
          onClick={() => setTab("anotacoes")}
        >
          Anotações
        </TabButton>
      </div>

      {tab === "contatos" ? (
        <LeadTimeline
          leadId={leadId}
          initial={initialInteracoes}
          canCreate={canCreateInteracao}
          mayHaveMore={mayHaveMoreInteracoes}
        />
      ) : (
        <LeadAnotacoes
          leadId={leadId}
          initial={initialAnotacoes}
          canEdit={canEditAnotacao}
          canDelete={canDeleteAnotacao}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-foreground/3",
      )}
    >
      {children}
    </button>
  );
}
