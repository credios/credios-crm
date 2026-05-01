"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/validators/auth";

type Props = {
  defaults: { nome: string; whatsapp: string | null };
  action: (input: UpdateProfileInput) => Promise<{ ok: boolean; error?: string }>;
};

export function ProfileForm({ defaults, action }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      nome: defaults.nome,
      whatsapp: defaults.whatsapp ?? "",
    },
  });

  async function onSubmit(values: UpdateProfileInput) {
    setPending(true);
    const result = await action(values);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error ?? "Erro ao salvar");
      return;
    }
    toast.success("Perfil atualizado");
    reset(values);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" autoComplete="name" disabled={pending} {...register("nome")} />
        {errors.nome && (
          <p className="text-xs text-destructive">{errors.nome.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="whatsapp">WhatsApp (opcional)</Label>
        <Input
          id="whatsapp"
          autoComplete="tel"
          placeholder="+5547999999999"
          disabled={pending}
          {...register("whatsapp")}
        />
        {errors.whatsapp && (
          <p className="text-xs text-destructive">{errors.whatsapp.message}</p>
        )}
      </div>
      <Button type="submit" disabled={pending || !isDirty}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Salvar alterações
      </Button>
    </form>
  );
}
