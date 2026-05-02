"use client";

import { Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  title: string;
  description?: string;
  canEdit: boolean;
  /** Render dos campos em modo VIEW. Itens vazios → "—". */
  view: { label: string; value: ReactNode }[];
  /** Componente de form (controlled) renderizado em modo EDIT. */
  edit: ReactNode;
  /** Função de validação opcional. Retorna mensagem ou null. */
  validate?: () => string | null;
  /** Payload PATCH /api/leads/[id] enviado ao salvar. */
  buildPayload: () => Record<string, unknown>;
  /** Callback após save bem-sucedido (ex: reset state local). */
  onSavedReset?: () => void;
  leadId: string;
};

export function LeadEditableCard({
  title,
  description,
  canEdit,
  view,
  edit,
  validate,
  buildPayload,
  onSavedReset,
  leadId,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (validate) {
      const msg = validate();
      if (msg) {
        setError(msg);
        return;
      }
    }
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    setPending(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const msg = typeof json.error === "string" ? json.error : `Falha (${res.status})`;
      setError(msg);
      toast.error("Erro ao salvar", { description: msg });
      return;
    }
    toast.success("Salvo");
    setEditing(false);
    onSavedReset?.();
    startTransition(() => router.refresh());
  }

  function handleCancel() {
    setEditing(false);
    setError(null);
    onSavedReset?.();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Editar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-4">
            <div>{edit}</div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Salvar
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={pending}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-[max-content_1fr] gap-y-1.5 gap-x-4 text-sm">
            {view.map(({ label, value }) => (
              <Fragment key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words">
                  {value === null || value === undefined || value === "" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    value
                  )}
                </dd>
              </Fragment>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
