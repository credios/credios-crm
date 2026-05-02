"use client";

import { Pencil, Plus, ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { UserEditDialog, type UserRow } from "./user-edit-dialog";
import { UserInviteDialog } from "./user-invite-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PERFIL_LABEL } from "@/lib/auth/types";
import { formatDateTimeBr, formatRelative } from "@/lib/formatters/date";

type Props = {
  users: UserRow[];
  currentUserId: string;
};

export function UsuariosPageClient({ users, currentUserId }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{users.length} usuários no sistema.</p>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="size-4" /> Convidar usuário
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <Th>Nome</Th>
                <Th>Email</Th>
                <Th>Perfil</Th>
                <Th>Status</Th>
                <Th>2FA</Th>
                <Th>Último login</Th>
                <Th>Criado</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">
                        {u.nome}
                        {isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{u.email}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{PERFIL_LABEL[u.perfil]}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {u.ativo ? (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 bg-emerald-500/10">
                            ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            desativado
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {u.hasMfa ? (
                          <ShieldCheck className="size-4 text-emerald-600" aria-label="2FA ativo" />
                        ) : (
                          <ShieldOff className="size-4 text-muted-foreground" aria-label="Sem 2FA" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {u.lastSignInAt ? formatRelative(u.lastSignInAt) : "nunca"}
                      </td>
                      <td
                        className="px-3 py-2 text-xs"
                        title={u.createdAt ? formatDateTimeBr(u.createdAt) : ""}
                      >
                        {u.createdAt ? formatRelative(u.createdAt) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditing(u)}
                          aria-label="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <UserInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={refresh} />
      {editing && (
        <UserEditDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          user={editing}
          isSelf={editing.id === currentUserId}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </th>
  );
}
