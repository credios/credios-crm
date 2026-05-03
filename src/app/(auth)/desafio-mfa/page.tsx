import { redirect } from "next/navigation";

import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function DesafioMfaPage({ searchParams }: Props) {
  const { next: rawNext } = await searchParams;
  // Sanitiza ANTES de usar — login/callback já fazem isso, MFA estava
  // pegando direto. Bloqueia open redirect via "//evil.com" ou absolutos.
  const next = safeNext(rawNext);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Se já está em AAL2, não precisa do desafio.
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData?.currentLevel === "aal2") {
    redirect(next);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">Verificação em duas etapas</CardTitle>
        <CardDescription>
          Para concluir o login, informe o código do seu app autenticador
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaChallengeForm redirectTo={next} />
      </CardContent>
    </Card>
  );
}
