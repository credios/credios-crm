import { redirect } from "next/navigation";

import { FirstAccessNomeForm } from "@/components/auth/first-access-nome-form";
import { MfaEnrollForm } from "@/components/auth/mfa-enroll-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppUser } from "@/lib/auth/get-app-user";
import { shouldEnforceMfa } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { updateNomeAction } from "./actions";

export default async function PrimeiroAcessoPage() {
  const appUser = await getAppUser();
  if (!appUser) redirect("/login");

  // Etapa 1: faltando nome.
  if (!appUser.nome) {
    const defaultNome =
      (appUser.authUser.user_metadata?.["full_name"] as string | undefined) ??
      (appUser.authUser.user_metadata?.["name"] as string | undefined) ??
      "";
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">Bem-vindo!</CardTitle>
          <CardDescription>
            Antes de começar, confirme seu nome de exibição
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FirstAccessNomeForm defaultNome={defaultNome} action={updateNomeAction} />
        </CardContent>
      </Card>
    );
  }

  // Etapa 2: admin sem MFA → enrolar.
  if (shouldEnforceMfa(appUser)) {
    const supabase = await createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerified = factors?.totp?.some((f) => f.status === "verified") ?? false;
    if (!hasVerified) {
      return (
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl">Configurar 2FA</CardTitle>
            <CardDescription>
              Como administrador, você precisa ativar autenticação em dois fatores
              antes de continuar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MfaEnrollForm />
          </CardContent>
        </Card>
      );
    }
  }

  // Tudo configurado → manda pra app.
  redirect("/leads");
}
