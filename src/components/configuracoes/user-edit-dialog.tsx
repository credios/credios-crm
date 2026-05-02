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
import { Switch } from "@/components/ui/switch";
import { PERFIL_LABEL, type Perfil } from "@/lib/auth/types";

export type UserRow = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  hasMfa: boolean;
  lastSignInAt?: Date | string | null;
  createdAt?: Date | string;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: UserRow;
  isSelf: boolean;
  onSaved: () => void;
};

export function UserEditDialog({ open, onOpenChange, user, isSelf, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <UserEditForm
            key={user.id}
            user={user}
            isSelf={isSelf}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onSaved();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserEditForm({
  user,
  isSelf,
  onCancel,
  onSaved,
}: {
  user: UserRow;
  isSelf: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(user.nome);
  const [perfil, setPerfil] = useState<Perfil>(user.perfil);
  const [ativo, setAtivo] = useState(user.ativo);
  const [pending, setPending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    if (nome.trim().length < 2) {
      setError("Nome muito curto");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/configuracoes/usuarios/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), perfil, ativo }),
    });
    setPending(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const msg = typeof json.error === "string" ? json.error : `Falha (${res.status})`;
      setError(msg);
      toast.error("Erro ao salvar", { description: msg });
      return;
    }
    toast.success("Usuário atualizado");
    onSaved();
  }

  async function onResetMfa() {
    if (!confirm(`Remover todos os fatores 2FA de ${user.nome}? No próximo login ele(a) precisará re-enrolar (admin) ou ficará sem 2FA.`)) return;
    setResetting(true);
    const res = await fetch(`/api/configuracoes/usuarios/${user.id}/reset-mfa`, {
      method: "POST",
    });
    setResetting(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string; removed?: number };
    if (!res.ok) {
      toast.error("Falha", { description: typeof json.error === "string" ? json.error : undefined });
      return;
    }
    toast.success(`${json.removed ?? 0} fatores removidos`);
    onSaved();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar usuário</DialogTitle>
        <DialogDescription>
          {user.email} · criado em {/* será passado em props se quiser; pulamos pra MVP */}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 py-2">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {isSelf && (
          <Alert>
            <AlertDescription>
              Você está editando o próprio usuário. Não é possível mudar o próprio
              perfil ou desativar a si mesmo (proteção contra lockout).
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ed-nome">Nome</Label>
          <Input
            id="ed-nome"
            value={nome}
            onChange={(e) => setNome(e.currentTarget.value)}
            disabled={pending}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Perfil</Label>
          <Select
            value={perfil}
            onValueChange={(v) => setPerfil((v ?? "consultor") as Perfil)}
            disabled={pending || isSelf}
          >
            <SelectTrigger>
              <SelectValue>
                {(v: unknown) =>
                  typeof v === "string" ? PERFIL_LABEL[v as Perfil] ?? v : null
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

        <div className="flex items-center gap-2">
          <Switch
            checked={ativo}
            onCheckedChange={setAtivo}
            disabled={pending || isSelf}
            id="ed-ativo"
          />
          <Label htmlFor="ed-ativo" className="cursor-pointer">
            {ativo ? "Ativo" : "Desativado"}
          </Label>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Autenticação em duas etapas</p>
              <p className="text-xs text-muted-foreground">
                {user.hasMfa
                  ? "Usuário tem 2FA ativo."
                  : "Usuário não tem 2FA configurado."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onResetMfa}
              disabled={resetting || !user.hasMfa}
            >
              {resetting && <Loader2 className="size-4 animate-spin" />}
              Forçar reset 2FA
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={onSave} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </>
  );
}
