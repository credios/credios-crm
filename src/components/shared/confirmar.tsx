"use client";

import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  /** Recebe a função que abre o diálogo — use no onClick do seu botão. */
  children: (abrir: () => void) => ReactNode;
  titulo: string;
  descricao: ReactNode;
  rotulo: string;
  destrutivo?: boolean;
  /** Fecha sozinho quando resolve; se lançar, fica aberto. */
  onConfirmar: () => Promise<void> | void;
};

/** Confirmação de ação sensível, no lugar do `window.confirm` do navegador. */
export function Confirmar({ children, titulo, descricao, rotulo, destrutivo, onConfirmar }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmar() {
    setBusy(true);
    try {
      await onConfirmar();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {children(() => setOpen(true))}
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Voltar
            </Button>
            <Button
              variant={destrutivo ? "destructive" : "default"}
              onClick={() => void confirmar()}
              disabled={busy}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {rotulo}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
