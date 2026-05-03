"use client";

import {
  Banknote,
  Building2,
  Check,
  Clock,
  Home,
  MapPin,
  MessageCircle,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AtribuirDialog } from "./atribuir-dialog";
import { DesqualificacaoDialog } from "@/components/leads/lead-status-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { EmptyLeads } from "@/components/shared/illustrations";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { formatRelative } from "@/lib/formatters/date";
import { formatPhoneBr, whatsappUrl } from "@/lib/formatters/phone";
import type { LeadNovoCard } from "@/lib/leads/list-leads-novos";
import { cn } from "@/lib/utils";

type Consultor = { id: string; nome: string };

type Props = {
  initial: LeadNovoCard[];
  consultores: Consultor[];
};

type DialogState =
  | { kind: "atribuir"; lead: LeadNovoCard }
  | { kind: "desqualificar"; lead: LeadNovoCard }
  | null;

export function LeadsNovosBoard({ initial, consultores }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [leads, setLeads] = useState<LeadNovoCard[]>(initial);
  const [dialog, setDialog] = useState<DialogState>(null);

  function removeLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }

  if (leads.length === 0) {
    return (
      <div className="surface-solid rounded-xl p-6">
        <EmptyState
          illustration={<EmptyLeads />}
          title="Tudo triado ✓"
          description="Nenhum lead pendente de atribuição. Quando novos leads chegarem do site, eles aparecerão aqui."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => startTransition(() => router.refresh())}
            >
              Recarregar
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger [&>*]:animate-fade-up">
        {leads.map((lead) => (
          <LeadCardNovo
            key={lead.id}
            lead={lead}
            onQualificar={() => setDialog({ kind: "atribuir", lead })}
            onDesqualificar={() => setDialog({ kind: "desqualificar", lead })}
          />
        ))}
      </div>

      {dialog?.kind === "atribuir" && (
        <AtribuirDialog
          open
          onOpenChange={(o) => {
            if (!o) setDialog(null);
          }}
          leadId={dialog.lead.id}
          leadNome={dialog.lead.nome}
          consultores={consultores}
          onSuccess={() => {
            removeLead(dialog.lead.id);
            setDialog(null);
            // Refresh em background pra trazer leads que chegaram enquanto
            // o dialog estava aberto. Não bloqueia UI — server component
            // re-renderiza com initial novo, useState mantém o que removeu.
            startTransition(() => router.refresh());
          }}
        />
      )}

      {dialog?.kind === "desqualificar" && (
        <DesqualificacaoDialog
          open
          onOpenChange={(o) => {
            if (!o) setDialog(null);
          }}
          leadId={dialog.lead.id}
          leadNome={dialog.lead.nome}
          status="desqualificado"
          onSuccess={() => {
            removeLead(dialog.lead.id);
            setDialog(null);
            startTransition(() => router.refresh());
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
}

// ============================================================================
// Card individual
// ============================================================================

function LeadCardNovo({
  lead,
  onQualificar,
  onDesqualificar,
}: {
  lead: LeadNovoCard;
  onQualificar: () => void;
  onDesqualificar: () => void;
}) {
  // Formato BR: "Cidade, UF". Se faltar UF, mostra só a cidade; se faltar
  // cidade mas tiver UF, mostra a UF. Se ambos faltam, vira "—" no DataItem.
  const localizacao = (() => {
    if (lead.cidade && lead.estado) return `${lead.cidade}, ${lead.estado}`;
    return lead.cidade ?? lead.estado ?? "";
  })();
  const wpUrl = whatsappUrl(lead.whatsapp);

  return (
    <article className="surface-solid rounded-xl p-4 flex flex-col gap-3 transition-shadow hover:shadow-md">
      {/* Header: nome + tempo desde criação */}
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/leads/${lead.id}`}
            prefetch={false}
            className="font-display text-base font-semibold leading-tight tracking-[-0.01em] hover:underline line-clamp-2"
          >
            {lead.nome}
          </Link>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3" strokeWidth={1.75} />
            {formatRelative(lead.createdAt)}
          </div>
        </div>
        {lead.origem && (
          <Badge variant="soft" className="shrink-0 text-[10px]">
            {lead.origem}
          </Badge>
        )}
      </header>

      {/* Dados essenciais */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <DataItem
          icon={Wallet}
          label="Valor buscado"
          value={
            lead.valorCreditoCentavos
              ? formatBrlFromCents(lead.valorCreditoCentavos)
              : "—"
          }
          tone="primary"
        />
        <DataItem
          icon={Home}
          label="Valor imóvel"
          value={
            lead.valorImovelCentavos
              ? formatBrlFromCents(lead.valorImovelCentavos)
              : "—"
          }
        />
        <DataItem
          icon={Banknote}
          label="Renda mensal"
          value={
            lead.rendaMensalCentavos
              ? formatBrlFromCents(lead.rendaMensalCentavos)
              : "—"
          }
        />
        <DataItem
          icon={Building2}
          label="Tipo imóvel"
          value={lead.tipoImovel || "—"}
        />
        <DataItem
          icon={MapPin}
          label="Localização"
          value={localizacao || "—"}
        />
      </dl>

      {/* WhatsApp (se tem) */}
      {wpUrl && (
        <a
          href={wpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline self-start"
        >
          <MessageCircle className="size-3.5" strokeWidth={1.75} />
          {formatPhoneBr(lead.whatsapp)}
        </a>
      )}

      {/* Ações */}
      <footer className="mt-auto flex gap-2 pt-2 border-t border-foreground/5">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          onClick={onDesqualificar}
        >
          <X className="size-3.5" strokeWidth={2} />
          Desqualificar
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={onQualificar}
        >
          <Check className="size-3.5" strokeWidth={2.25} />
          Qualificar
          <UserPlus className="size-3.5 opacity-70" strokeWidth={1.75} />
        </Button>
      </footer>
    </article>
  );
}

function DataItem({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  tone?: "primary";
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-subtle font-mono">
        <Icon className="size-2.5" strokeWidth={1.75} aria-hidden />
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 font-medium tabular-nums truncate",
          tone === "primary" ? "text-primary" : "text-foreground",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
