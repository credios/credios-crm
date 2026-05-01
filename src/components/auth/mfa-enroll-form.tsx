"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { totpCodeSchema, type TotpCodeInput } from "@/lib/validators/auth";

type EnrollData = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

type Props = {
  /** Para onde redirecionar depois de verificar com sucesso. Default: /leads */
  redirectTo?: string;
};

export function MfaEnrollForm({ redirectTo = "/leads" }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<TotpCodeInput>({ resolver: zodResolver(totpCodeSchema) });

  useEffect(() => {
    let cancelled = false;
    async function start() {
      // Limpa fatores não-verificados anteriores (caso o usuário tenha abandonado o fluxo).
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (factors?.totp) {
        for (const f of factors.totp) {
          if (f.status !== "verified") {
            await supabase.auth.mfa.unenroll({ factorId: f.id });
          }
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `CRM Credios (${new Date().toISOString().slice(0, 10)})`,
      });
      if (cancelled) return;
      if (error || !data) {
        setEnrollError(error?.message ?? "Erro ao iniciar 2FA");
        return;
      }
      setEnroll({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onSubmit(values: TotpCodeInput) {
    if (!enroll) return;
    setVerifyError(null);
    setPending(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enroll.factorId,
    });
    if (challengeError || !challenge) {
      setPending(false);
      setVerifyError(challengeError?.message ?? "Erro ao desafiar fator");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challenge.id,
      code: values.code,
    });
    setPending(false);
    if (verifyError) {
      setVerifyError(verifyError.message);
      reset();
      return;
    }
    toast.success("2FA configurado com sucesso");
    router.push(redirectTo);
    router.refresh();
  }

  if (enrollError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{enrollError}</AlertDescription>
      </Alert>
    );
  }

  if (!enroll) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-48 w-48 mx-auto" />
        <Skeleton className="h-4 w-3/4 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Abra o app autenticador (Google Authenticator, 1Password, Authy, etc.) e
        escaneie o QR code abaixo. Depois digite o código de 6 dígitos.
      </p>

      <div className="flex justify-center bg-white p-4 rounded-lg border">
        {/* qr_code do Supabase vem como SVG inline */}
        <div
          dangerouslySetInnerHTML={{ __html: enroll.qrCode }}
          className="size-48 [&_svg]:size-48"
        />
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Não consegue escanear? Mostrar chave</summary>
        <code className="mt-2 block break-all rounded bg-muted p-2 text-foreground">
          {enroll.secret}
        </code>
      </details>

      {verifyError && (
        <Alert variant="destructive">
          <AlertDescription>{verifyError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="code">Código de 6 dígitos</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            disabled={pending}
            {...register("code")}
          />
          {errors.code && (
            <p className="text-xs text-destructive">{errors.code.message}</p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Confirmar e ativar 2FA
        </Button>
      </form>
    </div>
  );
}
