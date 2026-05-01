"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  firstAccessNomeSchema,
  type FirstAccessNomeInput,
} from "@/lib/validators/auth";

type Props = {
  defaultNome?: string;
  action: (input: FirstAccessNomeInput) => Promise<{ ok: boolean; error?: string }>;
};

export function FirstAccessNomeForm({ defaultNome, action }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FirstAccessNomeInput>({
    resolver: zodResolver(firstAccessNomeSchema),
    defaultValues: { nome: defaultNome ?? "" },
  });

  async function onSubmit(values: FirstAccessNomeInput) {
    setError(null);
    setPending(true);
    const result = await action(values);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Erro ao salvar");
      toast.error(result.error ?? "Erro ao salvar");
      return;
    }
    toast.success("Nome salvo");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="nome">Como você quer ser chamado?</Label>
        <Input
          id="nome"
          autoComplete="name"
          placeholder="Seu nome completo"
          disabled={pending}
          {...register("nome")}
        />
        {errors.nome && (
          <p className="text-xs text-destructive">{errors.nome.message}</p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Continuar
      </Button>
    </form>
  );
}
