"use client";

import {
  Loader2,
  MessageSquare,
  Phone,
  Send,
  Shuffle,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MudarStatusQuickDialog } from "./mudar-status-quick-dialog";
import { NotaRapidaDialog } from "./nota-rapida-dialog";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/lib/formatters/phone";

/** Shape mínimo pra agir sobre um lead. FilaItem e NegociacaoAberta satisfazem. */
export type QuickActionTarget = {
  leadId: string;
  leadNome: string;
  whatsapp: string | null;
  status: string;
};

type Props = {
  item: QuickActionTarget;
  onResolved: () => void;
  /** Inclui transições de encerramento (perdido/desqualificado) no "Mudar
   *  status", com coleta de motivo. Usado na página de negociações. */
  allowEncerrar?: boolean;
};

export function QuickActionsToolbar({
  item,
  onResolved,
  allowEncerrar = false,
}: Props) {
  const [openNota, setOpenNota] = useState(false);
  const [openStatus, setOpenStatus] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const wpHref = whatsappUrl(item.whatsapp);

  async function registrarInteracao(
    tipo: "ligacao" | "whatsapp_enviado",
    label: string,
  ) {
    setPendingAction(tipo);
    const res = await fetch(`/api/leads/${item.leadId}/interacoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo }),
    });
    setPendingAction(null);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(`Não consegui registrar ${label}`, {
        description:
          typeof json.error === "string" ? json.error : `Falha ${res.status}`,
      });
      return;
    }
    toast.success(`${label} registrado`);
    onResolved();
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {wpHref && (
          <ActionButton
            icon={MessageSquare}
            label="WhatsApp"
            onClick={() => window.open(wpHref, "_blank", "noopener,noreferrer")}
            tone="success"
          />
        )}
        <ActionButton
          icon={Phone}
          label="Liguei"
          onClick={() => registrarInteracao("ligacao", "Ligação")}
          loading={pendingAction === "ligacao"}
        />
        <ActionButton
          icon={Send}
          label="WhatsApp ✓"
          onClick={() =>
            registrarInteracao("whatsapp_enviado", "WhatsApp enviado")
          }
          loading={pendingAction === "whatsapp_enviado"}
          title="Registrar que enviei WhatsApp"
        />
        <ActionButton
          icon={Shuffle}
          label="Mudar status"
          onClick={() => setOpenStatus(true)}
        />
        <ActionButton
          icon={StickyNote}
          label="Anotar"
          onClick={() => setOpenNota(true)}
        />
      </div>

      <NotaRapidaDialog
        open={openNota}
        onOpenChange={setOpenNota}
        leadId={item.leadId}
        leadNome={item.leadNome}
        onSuccess={() => {
          setOpenNota(false);
          onResolved();
        }}
      />
      <MudarStatusQuickDialog
        open={openStatus}
        onOpenChange={setOpenStatus}
        leadId={item.leadId}
        leadNome={item.leadNome}
        statusAtual={item.status}
        incluirEncerramento={allowEncerrar}
        onSuccess={() => {
          setOpenStatus(false);
          onResolved();
        }}
      />
    </>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  loading,
  tone,
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  loading?: boolean;
  tone?: "primary" | "success";
  title?: string;
}) {
  const toneCls =
    tone === "success"
      ? "border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
      : tone === "primary"
        ? "border-primary/30 text-primary hover:bg-primary/10"
        : "";
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={loading}
      title={title ?? label}
      className={toneCls}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Icon className="size-3.5" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
