import { redirect } from "next/navigation";

import { BottomNav } from "@/components/shared/bottom-nav";
import { CommandPalette } from "@/components/shared/command-palette";
import { CrediosLogo } from "@/components/shared/credios-logo";
import { Header } from "@/components/shared/header";
import { Sidebar } from "@/components/shared/sidebar";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin, shouldEnforceMfa } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const appUser = await getAppUser();
  if (!appUser) redirect("/login");

  if (!appUser.ativo) {
    redirect("/sem-permissao");
  }

  if (!appUser.nome) {
    redirect("/primeiro-acesso");
  }

  if (shouldEnforceMfa(appUser)) {
    const supabase = await createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerifiedFactor =
      factors?.totp?.some((f) => f.status === "verified") ?? false;
    if (!hasVerifiedFactor) {
      redirect("/primeiro-acesso");
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
      redirect("/desafio-mfa");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="surface-frosted hidden md:flex w-60 shrink-0 flex-col rounded-none border-y-0 border-l-0 border-r">
        <div className="flex h-16 flex-col justify-center gap-1 px-5">
          <CrediosLogo size="md" />
          <span className="self-start font-mono text-[10px] uppercase tracking-[0.22em] text-gold-700 dark:text-gold-400 pl-7">
            CRM
          </span>
        </div>
        <Sidebar
          isAdmin={isAdmin(appUser)}
          isConsultor={appUser.perfil === "consultor"}
          className="flex-1"
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          user={{
            nome: appUser.nome,
            email: appUser.email,
            perfil: appUser.perfil,
          }}
        />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-8 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
      {appUser.perfil !== "marketing" && (
        <>
          <CommandPalette />
          <BottomNav />
        </>
      )}
    </div>
  );
}
