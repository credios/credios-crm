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
  const showPalette = user.perfil !== "marketing";
  return (
    <header className="surface-frosted sticky top-0 z-30 rounded-none border-x-0 border-t-0 border-b">
      <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
        <MobileNav isAdmin={isAdmin} isConsultor={isConsultor} />
        <div className="md:hidden flex items-center gap-1.5">
          <CrediosLogo size="sm" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-700 dark:text-gold-400">
            CRM
          </span>
        </div>
        <div className="hidden md:flex flex-1 justify-center">
          {showPalette && <CommandPaletteTrigger />}
        </div>
        <div className="md:hidden flex-1" />
        {showPalette && <NotificationsBellLazy />}
        <UserMenu user={user} />
      </div>
    </header>
  );
}
