"use client";

import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PERFIL_LABEL, type Perfil } from "@/lib/auth/types";

type Props = {
  user: {
    nome: string;
    email: string;
    perfil: Perfil;
  };
};

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu({ user }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      const res = await fetch("/auth/logout", { method: "POST", redirect: "manual" });
      if (!res.ok && res.type !== "opaqueredirect") {
        throw new Error(`logout failed: ${res.status}`);
      }
    } catch (err) {
      toast.error("Erro ao sair", {
        description: err instanceof Error ? err.message : "Tente novamente",
      });
      setPending(false);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="gap-2 h-auto px-2 py-1">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">{initials(user.nome)}</AvatarFallback>
            </Avatar>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-tight">{user.nome}</p>
              <p className="text-xs text-muted-foreground leading-tight">
                {PERFIL_LABEL[user.perfil]}
              </p>
            </div>
            <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{user.nome}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/perfil" />}>
          <UserIcon className="size-4" />
          Meu perfil
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleLogout} disabled={pending}>
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
