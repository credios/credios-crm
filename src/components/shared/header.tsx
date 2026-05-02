import { MobileNav } from "./mobile-nav";
import { NotificationsBell } from "./notifications-bell";
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
  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
        <MobileNav isAdmin={isAdmin} />
        <div className="md:hidden font-semibold">CRM Credios</div>
        <div className="flex-1" />
        {user.perfil !== "marketing" && <NotificationsBell />}
        <UserMenu user={user} />
      </div>
    </header>
  );
}
