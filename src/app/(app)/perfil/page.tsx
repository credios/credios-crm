import { redirect } from "next/navigation";

import { AparenciaCard } from "@/components/auth/aparencia-card";
import { MfaDisableButton } from "@/components/auth/mfa-disable-button";
import { MfaEnrollForm } from "@/components/auth/mfa-enroll-form";
import { ProfileForm } from "@/components/auth/profile-form";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { PERFIL_LABEL } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

import { disableMfaAction, updatePasswordAction, updateProfileAction } from "./actions";

export default async function PerfilPage() {
  const appUser = await getAppUser();
  if (!appUser) redirect("/login");

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = factors?.totp?.find((f) => f.status === "verified") ?? null;
  const admin = isAdmin(appUser);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          Meu perfil
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Atualize suas informações pessoais, segurança e aparência do CRM.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informações pessoais</CardTitle>
            <CardDescription>
              {appUser.email} • {PERFIL_LABEL[appUser.perfil]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              defaults={{ nome: appUser.nome, whatsapp: appUser.whatsapp }}
              action={updateProfileAction}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Senha</CardTitle>
            <CardDescription>
              Defina uma senha para login com email/senha (alternativa ao Google).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SetPasswordForm action={updatePasswordAction} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                Autenticação em duas etapas (TOTP)
                {verifiedTotp && (
                  <Badge variant="default" className="bg-emerald-600">
                    ativo
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {admin
                  ? "Obrigatório para administradores."
                  : "Recomendado para todas as contas."}
              </CardDescription>
            </div>
            {verifiedTotp && !admin && (
              <MfaDisableButton factorId={verifiedTotp.id} action={disableMfaAction} />
            )}
          </CardHeader>
          <CardContent>
            {verifiedTotp ? (
              <p className="text-sm text-muted-foreground">
                Fator <code className="rounded bg-muted px-1 py-0.5 text-xs">{verifiedTotp.friendly_name ?? verifiedTotp.id}</code>{" "}
                cadastrado.
                {admin && (
                  <> Para trocar o fator, desative na sua conta Supabase e refaça o enroll.</>
                )}
              </p>
            ) : (
              <MfaEnrollForm redirectTo="/perfil" />
            )}
          </CardContent>
        </Card>

        <AparenciaCard />
      </div>
    </div>
  );
}
