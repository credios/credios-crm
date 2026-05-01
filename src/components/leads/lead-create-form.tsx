/* eslint-disable react-hooks/incompatible-library */
// `watch()` no JSX dispara re-renders por field — aceitável neste MVP. Refatorar
// para `useWatch` / `Controller` se a perf do form vier a ser crítica.
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ESTADOS_CIVIS,
  OBJETIVOS_CREDITO,
  OCUPACOES,
  ORIGENS,
  SITUACOES_IMOVEL,
  TIPOS_IMOVEL,
  TIPOS_PESSOA,
  UFS,
} from "@/lib/constants";

// Schema simplificado: todos os campos como string opcional. Coerção numérica
// e mapeamento snake/camel acontecem no submit.
const formSchema = z.object({
  nome: z.string().trim().min(2, "Mínimo 2 caracteres"),
  cpf: z.string().optional(),
  estadoCivil: z.string().optional(),
  ocupacao: z.string().optional(),
  rendaMensalReais: z.string().optional(),
  whatsapp: z.string().trim().min(8, "Obrigatório"),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Email inválido")
    .optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  objetivoCredito: z.string().optional(),
  tipoImovel: z.string().optional(),
  situacaoImovel: z.string().optional(),
  tipoPessoa: z.string().optional(),
  valorImovelReais: z.string().optional(),
  valorCreditoReais: z.string().optional(),
  consultorId: z.string().optional(),
  origem: z.string().default("Manual"),
});
type FormValues = z.input<typeof formSchema>;

function reaisToCents(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

type Props = {
  currentUser: { id: string; perfil: "admin" | "gerente" | "consultor" | "marketing" };
  consultores: { id: string; nome: string }[];
};

export function LeadCreateForm({ currentUser, consultores }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const isAdminOrGerente =
    currentUser.perfil === "admin" || currentUser.perfil === "gerente";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      whatsapp: "",
      email: "",
      origem: "Manual",
    },
  });
  const { register, handleSubmit, setValue, watch, formState: { errors } } = form;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setPending(true);

    const payload = {
      nome: values.nome,
      cpf: values.cpf?.trim() || null,
      estadoCivil: values.estadoCivil || null,
      ocupacao: values.ocupacao || null,
      rendaMensalCentavos: reaisToCents(values.rendaMensalReais),
      whatsapp: values.whatsapp.trim(),
      email: values.email?.trim() || null,
      cidade: values.cidade?.trim() || null,
      estado: values.estado || null,
      objetivoCredito: values.objetivoCredito || null,
      tipoImovel: values.tipoImovel || null,
      situacaoImovel: values.situacaoImovel || null,
      tipoPessoa: values.tipoPessoa || null,
      valorImovelCentavos: reaisToCents(values.valorImovelReais),
      valorCreditoCentavos: reaisToCents(values.valorCreditoReais),
      consultorId: values.consultorId || null,
      origem: values.origem || "Manual",
    };

    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id?: string };
      error?: string | unknown;
    };
    setPending(false);

    if (!res.ok) {
      const msg =
        typeof json.error === "string"
          ? json.error
          : `Falha ao criar lead (status ${res.status})`;
      setServerError(msg);
      toast.error("Erro ao criar lead", { description: msg });
      return;
    }

    toast.success("Lead criado");
    const newId = json.data?.id;
    router.push(newId ? `/leads/${newId}` : "/leads");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" autoComplete="name" placeholder="Nome completo" disabled={pending} {...register("nome")} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" inputMode="numeric" placeholder="000.000.000-00" disabled={pending} {...register("cpf")} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado civil</Label>
            <Select value={watch("estadoCivil") ?? ""} onValueChange={(v) => setValue("estadoCivil", v ?? "")} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {ESTADOS_CIVIS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ocupação</Label>
            <Select value={watch("ocupacao") ?? ""} onValueChange={(v) => setValue("ocupacao", v ?? "")} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {OCUPACOES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rendaMensalReais">Renda mensal (R$)</Label>
            <Input id="rendaMensalReais" type="number" step="0.01" min="0" placeholder="0" disabled={pending} {...register("rendaMensalReais")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contato</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp *</Label>
            <Input id="whatsapp" type="tel" autoComplete="tel" placeholder="+5547999999999" disabled={pending} {...register("whatsapp")} />
            {errors.whatsapp && <p className="text-xs text-destructive">{errors.whatsapp.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="cliente@email.com" disabled={pending} {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cidade">Cidade</Label>
            <Input id="cidade" disabled={pending} {...register("cidade")} />
          </div>
          <div className="space-y-1.5">
            <Label>UF</Label>
            <Select value={watch("estado") ?? ""} onValueChange={(v) => setValue("estado", v ?? "")} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {UFS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operação (CGI)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Objetivo do crédito</Label>
            <Select value={watch("objetivoCredito") ?? ""} onValueChange={(v) => setValue("objetivoCredito", v ?? "")} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {OBJETIVOS_CREDITO.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de imóvel</Label>
            <Select value={watch("tipoImovel") ?? ""} onValueChange={(v) => setValue("tipoImovel", v ?? "")} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {TIPOS_IMOVEL.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Situação do imóvel</Label>
            <Select value={watch("situacaoImovel") ?? ""} onValueChange={(v) => setValue("situacaoImovel", v ?? "")} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {SITUACOES_IMOVEL.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de pessoa</Label>
            <Select value={watch("tipoPessoa") ?? ""} onValueChange={(v) => setValue("tipoPessoa", v ?? "")} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {TIPOS_PESSOA.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="valorImovelReais">Valor do imóvel (R$)</Label>
            <Input id="valorImovelReais" type="number" step="0.01" min="0" placeholder="500000" disabled={pending} {...register("valorImovelReais")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="valorCreditoReais">Valor do crédito buscado (R$)</Label>
            <Input id="valorCreditoReais" type="number" step="0.01" min="0" placeholder="200000" disabled={pending} {...register("valorCreditoReais")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Origem e atribuição</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Origem</Label>
            <Select value={watch("origem") ?? "Manual"} onValueChange={(v) => setValue("origem", v ?? "")} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Manual" /></SelectTrigger>
              <SelectContent>
                {ORIGENS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isAdminOrGerente && consultores.length > 0 && (
            <div className="space-y-1.5">
              <Label>Atribuir ao consultor</Label>
              <Select value={watch("consultorId") ?? ""} onValueChange={(v) => setValue("consultorId", v ?? "")} disabled={pending}>
                <SelectTrigger><SelectValue placeholder="Pool não-atribuído" /></SelectTrigger>
                <SelectContent>
                  {consultores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Criar lead
        </Button>
      </div>
    </form>
  );
}
