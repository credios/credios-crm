import { redirect } from "next/navigation";

import { CommandPalette } from "@/components/shared/command-palette";
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

  // Admin sem MFA verificado → manda enrolar.
  // Admin com MFA mas sessão em AAL1 → desafio.
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
      redirect("/auth/desafio-mfa");
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card">
        <div className="flex h-14 items-center px-6 border-b">
          <h1 className="text-base font-semibold tracking-tight">CRM Credios</h1>
        </div>
        <Sidebar isAdmin={isAdmin(appUser)} className="flex-1" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          user={{
            nome: appUser.nome,
            email: appUser.email,
            perfil: appUser.perfil,
          }}
        />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
      {appUser.perfil !== "marketing" && <CommandPalette />}
    </div>
  );
}
