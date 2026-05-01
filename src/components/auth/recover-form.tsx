"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  recoverPasswordSchema,
  type RecoverPasswordInput,
} from "@/lib/validators/auth";

export function RecoverForm() {
  const supabase = createClient();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RecoverPasswordInput>({
    resolver: zodResolver(recoverPasswordSchema),
  });

  async function onSubmit(values: RecoverPasswordInput) {
    setPending(true);
    const redirectTo = new URL(
      "/recuperar-senha/confirmar",
      window.location.origin,
    ).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo,
    });
    setPending(false);
    if (error) {
      toast.error("Não foi possível enviar email", { description: error.message });
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Alert>
        <AlertDescription>
          Se houver uma conta com esse email, enviaremos um link para redefinir a
          senha. Verifique sua caixa de entrada (e spam).
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="seu@credios.com.br"
          disabled={pending}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Enviar link de recuperação
      </Button>
    </form>
  );
}
