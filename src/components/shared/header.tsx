import { CommandPaletteTrigger } from "./command-palette-trigger";
import { CrediosLogo } from "./credios-logo";
import { MobileNav } from "./mobile-nav";
import { NotificationsBellLazy } from "./notifications-bell-lazy";
import { UserMenu } from "./user-menu";
import type { Perfil } from "@/lib/auth/types";

type Props = {
  user: {
    nome: string;
    email: string;
    perfil: Perfil;
  };
};

export function Header({ user }: Props) {
  const isAdmin = user.perfil === "admin";
  const isConsultor = user.perfil === "consultor";
  const isMarketing = user.perfil === "marketing";
  // Marketing busca lead por nome/CPF/telefone como os demais perfis. O sino de
  // notificações continua fora: alertas de SLA e leads novos são operacionais
  // (as APIs por trás dele bloqueiam marketing).
  const showNotificacoes = !isMarketing;
  return (
    <header className="surface-frosted sticky top-0 z-30 rounded-none border-x-0 border-t-0 border-b">
      <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
        <MobileNav
          isAdmin={isAdmin}
          isConsultor={isConsultor}
          isMarketing={isMarketing}
        />
        <div className="md:hidden flex items-center gap-1.5">
          <CrediosLogo size="sm" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-700 dark:text-gold-400">
            CRM
          </span>
        </div>
        <div className="hidden md:flex flex-1 justify-center">
          <CommandPaletteTrigger />
        </div>
        <div className="md:hidden flex-1" />
        {showNotificacoes && <NotificationsBellLazy />}
        <UserMenu user={user} />
      </div>
    </header>
  );
}
