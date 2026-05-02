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
import { createClient } from "@/lib/supabase/client";
import { totpCodeSchema, type TotpCodeInput } from "@/lib/validators/auth";

type Props = {
  redirectTo?: string;
};

export function MfaChallengeForm({ redirectTo = "/leads" }: Props) {
  const router = useRouter();
  // Lazy init: createClient() lê env vars que não existem em build estático.
  const [supabase] = useState(() => createClient());
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    async function load() {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (!verified) {
        setLoadError("Nenhum fator MFA verificado encontrado.");
        return;
      }
      setFactorId(verified.id);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onSubmit(values: TotpCodeInput) {
    if (!factorId) return;
    setVerifyError(null);
    setPending(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError || !challenge) {
      setPending(false);
      setVerifyError(challengeError?.message ?? "Erro ao iniciar desafio");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: values.code,
    });
    setPending(false);
    if (verifyError) {
      setVerifyError(verifyError.message);
      reset();
      return;
    }
    toast.success("Identidade confirmada");
    router.push(redirectTo);
    router.refresh();
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {verifyError && (
        <Alert variant="destructive">
          <AlertDescription>{verifyError}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="code">Código do app autenticador</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          disabled={pending || !factorId}
          autoFocus
          {...register("code")}
        />
        {errors.code && (
          <p className="text-xs text-destructive">{errors.code.message}</p>
        )}
      </div>
      <Button type="submit" disabled={pending || !factorId} className="w-full">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Verificar
      </Button>
    </form>
  );
}
