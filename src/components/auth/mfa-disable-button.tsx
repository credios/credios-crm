"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type Props = {
  factorId: string;
  action: (factorId: string) => Promise<{ ok: boolean; error?: string }>;
};

export function MfaDisableButton({ factorId, action }: Props) {
  const [pending, setPending] = useState(false);
  async function handleClick() {
    if (!confirm("Tem certeza que quer desativar o 2FA?")) return;
    setPending(true);
    const r = await action(factorId);
    setPending(false);
    if (!r.ok) {
      toast.error(r.error ?? "Erro");
      return;
    }
    toast.success("2FA desativado");
  }
  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      Desativar 2FA
    </Button>
  );
}
