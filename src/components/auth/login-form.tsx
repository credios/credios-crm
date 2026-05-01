"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { GoogleIcon } from "@/components/auth/google-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { emailPasswordSchema, type EmailPasswordInput } from "@/lib/validators/auth";

type Props = {
  error?: string;
  redirectTo?: string;
};

export function LoginForm({ error: initialError, redirectTo }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const next = redirectTo ?? "/leads";

  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(initialError ?? null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailPasswordInput>({
    resolver: zodResolver(emailPasswordSchema),
  });

  async function onSubmit(values: EmailPasswordInput) {
    setSubmitError(null);
    setPending(true);
    const { error } = await supabase.auth.signInWithPassword(values);
    setPending(false);
    if (error) {
      setSubmitError(error.message);
      toast.error("Falha no login", { description: error.message });
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function handleGoogle() {
    setSubmitError(null);
    setGooglePending(true);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (error) {
      setGooglePending(false);
      setSubmitError(error.message);
      toast.error("Falha no Google login", { description: error.message });
    }
    // Em sucesso, browser redireciona para Google.
  }

  return (
    <div className="space-y-4">
      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        onClick={handleGoogle}
        disabled={googlePending || pending}
        className="w-full"
        size="lg"
      >
        {googlePending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <GoogleIcon className="size-4" />
        )}
        Entrar com Google
      </Button>

      <div className="relative py-2">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
          ou com email
        </span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="seu@credios.com.br"
            disabled={pending || googlePending}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            disabled={pending || googlePending}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button
          type="submit"
          variant="outline"
          disabled={pending || googlePending}
          className="w-full"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Entrar
        </Button>
      </form>
    </div>
  );
}
