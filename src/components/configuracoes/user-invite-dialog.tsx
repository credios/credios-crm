"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERFIL_LABEL, type Perfil } from "@/lib/auth/types";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onInvited: () => void;
};

export function UserInviteDialog({ open, onOpenChange, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("consultor");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setNome("");
    setPerfil("consultor");
    setError(null);
  }

  async function onSubmit() {
    setError(null);
    if (!email.includes("@")) {
      setError("Email inválido");
      return;
    }
    if (nome.trim().length < 2) {
      setError("Nome muito curto");
      return;
    }
    setPending(true);
    const res = await fetch("/api/configuracoes/usuarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), nome: nome.trim(), perfil }),
    });
    setPending(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const msg = typeof json.error === "string" ? json.error : `Falha (${res.status})`;
      setError(msg);
      toast.error("Erro ao convidar", { description: msg });
      return;
    }
    toast.success("Convite enviado");
    reset();
    onInvited();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!pending) onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar novo usuário</DialogTitle>
          <DialogDescription>
            O usuário recebe email com link de signup. No primeiro login, define
            nome (se vazio) e — se admin — configura 2FA.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              placeholder="usuario@credios.com.br"
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-nome">Nome</Label>
            <Input
              id="inv-nome"
              value={nome}
              onChange={(e) => setNome(e.currentTarget.value)}
              placeholder="Nome completo"
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Perfil</Label>
            <Select value={perfil} onValueChange={(v) => setPerfil((v ?? "consultor") as Perfil)} disabled={pending}>
              <SelectTrigger>
                <SelectValue>
                  {(v: unknown) =>
                    typeof v === "string"
                      ? PERFIL_LABEL[v as Perfil] ?? v
                      : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="gerente">Gerente</SelectItem>
                <SelectItem value="consultor">Consultor</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Enviar convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
