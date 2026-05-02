"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { GoogleIcon } from "@/components/auth/google-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/client";

import { loginWithPasswordAction, type LoginState } from "@/app/(auth)/login/actions";

type Props = {
  error?: string;
  redirectTo?: string;
};

export function LoginForm({ error: initialError, redirectTo }: Props) {
  // safeNext aplicado IMEDIATAMENTE no parâmetro recebido — nada do que
  // chegar como `redirectTo` (URL pública) é confiável.
  const next = safeNext(redirectTo);

  const [state, formAction] = useActionState<LoginState, FormData>(
    loginWithPasswordAction,
    { error: initialError },
  );

  const [googlePending, setGooglePending] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleGoogle() {
    setGoogleError(null);
    setGooglePending(true);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", next); // já sanitizado
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (error) {
      setGooglePending(false);
      setGoogleError(error.message);
      toast.error("Falha no Google login", { description: error.message });
    }
    // Em sucesso, browser redireciona para Google.
  }

  const error = googleError ?? state.error;

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        onClick={handleGoogle}
        disabled={googlePending}
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

      <form action={formAction} className="space-y-3" noValidate>
        {/* next sanitizado vai como hidden input pra server action ler */}
        <input type="hidden" name="next" value={next} />

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="seu@credios.com.br"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <SubmitButton disabled={googlePending} />
      </form>
    </div>
  );
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending || disabled}
      className="w-full"
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      Entrar
    </Button>
  );
}
