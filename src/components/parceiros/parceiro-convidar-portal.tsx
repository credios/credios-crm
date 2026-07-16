"use client";

import { ExternalLink, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Handoff CRM → Portal de Parceiros (admin only). Um clique: cria o Partner
// no portal (status INVITED), dispara o convite por e-mail e vincula os dois
// registros (portal_partner_id aqui, crmPartnerRef lá). Pré-requisitos:
// e-mail e CPF/CNPJ (o contrato do portal exige documento).

type Props = {
  parceiro: {
    id: string;
    status: string;
    email: string | null;
    cpfCnpj: string | null;
    portalPartnerId: string | null;
    convidadoPortalEm: string | null;
  };
};

export function ParceiroConvidarPortal({ parceiro }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const jaConvidado = Boolean(parceiro.portalPartnerId);
  const faltam: string[] = [];
  if (!parceiro.email) faltam.push("e-mail");
  if (!parceiro.cpfCnpj) faltam.push("CPF/CNPJ");

  async function convidar() {
    setBusy(true);
    try {
      const res = await fetch(`/api/parceiros/${parceiro.id}/convidar-portal`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Não consegui criar o convite no portal.");
        setBusy(false);
        return;
      }
      toast.success("Convite enviado! O parceiro recebe o e-mail do portal.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Falha de conexão com o portal.");
    }
    setBusy(false);
  }

  return (
    <Card className={jaConvidado ? "border-emerald-500/30" : "border-primary/25"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="size-4 text-muted-foreground" />
          Portal de parceiros
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {jaConvidado ? (
          <>
            <p className="text-sm text-muted-foreground">
              {parceiro.status === "ativo"
                ? "Parceria ativa — contrato assinado no portal."
                : "Convite enviado. Quando o parceiro assinar o contrato, o status vira Ativo automaticamente."}
            </p>
            <a
              href="https://parceiros.credios.com.br/admin/parceiros"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Abrir no portal <ExternalLink className="size-3.5" />
            </a>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Fechou a parceria? Crie o cadastro no portal e dispare o convite com o
              contrato para assinatura eletrônica — em um clique.
            </p>
            {faltam.length > 0 && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                Antes, preencha em &quot;Editar&quot;: {faltam.join(" e ")}.
              </p>
            )}
            <Button
              size="sm"
              disabled={faltam.length > 0}
              onClick={() => setOpen(true)}
              className="gap-1.5"
            >
              <Send className="size-3.5" /> Criar no portal e convidar
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar para o portal</DialogTitle>
            <DialogDescription>
              O parceiro será criado no portal e receberá, por e-mail, o convite para
              definir a senha e assinar o contrato de parceria eletronicamente. Confirma?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void convidar()} disabled={busy}>
              {busy ? "Enviando…" : "Confirmar convite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
