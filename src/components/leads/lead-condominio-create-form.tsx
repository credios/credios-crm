/* eslint-disable react-hooks/incompatible-library */
// `watch()` no JSX — mesmo trade-off do lead-create-form.tsx.
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ASSEMBLEIA_STATUS,
  ASSEMBLEIA_STATUS_LABEL,
  FINALIDADES_CONDOMINIO,
  type AssembleiaStatus,
} from "@/lib/condominio/constants";
import { UFS } from "@/lib/constants";
import { isValidCnpj, maskCnpj } from "@/lib/formatters/cpf-cnpj";

const SEM_PARCEIRO = "__none__";

const formSchema = z.object({
  nome: z.string().trim().min(2, "Mínimo 2 caracteres"),
  cnpj: z
    .string()
    .optional()
    .refine((v) => !v || v.trim() === "" || isValidCnpj(v), "CNPJ inválido"),
  administradora: z.string().optional(),
  numUnidades: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),

  sindicoNome: z.string().optional(),
  whatsapp: z.string().trim().min(8, "Obrigatório"),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Email inválido")
    .optional(),
  sindicoProfissional: z.string().optional(),

  valorCreditoReais: z.string().optional(),
  finalidade: z.string().optional(),
  finalidadeDetalhes: z.string().optional(),
  prazoDesejadoMeses: z.string().optional(),

  arrecadacaoMensalReais: z.string().optional(),
  inadimplenciaPct: z.string().optional(),
  assembleiaStatus: z.string().optional(),

  origem: z.string().default("Manual"),
  parceiroId: z.string().optional(),
  consultorId: z.string().optional(),
});
type FormValues = z.input<typeof formSchema>;

function reaisToCents(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

function toInt(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

type Props = {
  currentUser: { id: string; perfil: "admin" | "gerente" | "consultor" | "marketing" };
  consultores: { id: string; nome: string }[];
  sources: Array<{ source: string; channel: string; displayName: string; ordem: number }>;
  parceiros: { id: string; nome: string }[];
};

export function LeadCondominioCreateForm({
  currentUser,
  consultores,
  sources,
  parceiros,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const isAdminOrGerente =
    currentUser.perfil === "admin" || currentUser.perfil === "gerente";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { nome: "", whatsapp: "", email: "", origem: "Manual" },
  });
  const { register, handleSubmit, setValue, watch, formState: { errors } } = form;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setPending(true);

    const inad = values.inadimplenciaPct?.trim()
      ? Number(values.inadimplenciaPct.replace(",", "."))
      : null;

    const payload = {
      produto: "CONDOMINIO",
      nome: values.nome,
      whatsapp: values.whatsapp.trim(),
      email: values.email?.trim() || null,
      cidade: values.cidade?.trim() || null,
      estado: values.estado || null,
      tipoPessoa: "Pessoa Jurídica",
      valorCreditoCentavos: reaisToCents(values.valorCreditoReais),
      objetivoCredito: values.finalidade || null,
      consultorId: values.consultorId || null,
      parceiroId:
        values.parceiroId && values.parceiroId !== SEM_PARCEIRO ? values.parceiroId : null,
      origem: values.origem || "Manual",
      condominio: {
        cnpj: values.cnpj?.trim() || null,
        cep: values.cep?.trim() || null,
        logradouro: values.logradouro?.trim() || null,
        numero: values.numero?.trim() || null,
        complemento: values.complemento?.trim() || null,
        bairro: values.bairro?.trim() || null,
        administradora: values.administradora?.trim() || null,
        numUnidades: toInt(values.numUnidades),
        sindicoNome: values.sindicoNome?.trim() || null,
        sindicoProfissional:
          values.sindicoProfissional === "true"
            ? true
            : values.sindicoProfissional === "false"
              ? false
              : null,
        finalidadeDetalhes: values.finalidadeDetalhes?.trim() || null,
        prazoDesejadoMeses: toInt(values.prazoDesejadoMeses) || null,
        arrecadacaoMensalCentavos: reaisToCents(values.arrecadacaoMensalReais),
        inadimplenciaBps:
          inad != null && Number.isFinite(inad) ? Math.round(inad * 100) : null,
        assembleiaStatus: values.assembleiaStatus || null,
      },
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

    toast.success("Condomínio cadastrado");
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
          <CardTitle className="text-base">Condomínio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="nome">Nome do condomínio *</Label>
            <Input id="nome" placeholder="Condomínio Edifício…" disabled={pending} {...register("nome")} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input
              id="cnpj"
              inputMode="numeric"
              autoComplete="off"
              placeholder="00.000.000/0000-00"
              disabled={pending}
              {...register("cnpj", {
                onChange: (e) =>
                  setValue("cnpj", maskCnpj(e.currentTarget.value), { shouldValidate: true }),
              })}
            />
            {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numUnidades">Número de unidades</Label>
            <Input id="numUnidades" type="number" min="0" step="1" disabled={pending} {...register("numUnidades")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="administradora">Administradora</Label>
            <Input id="administradora" disabled={pending} {...register("administradora")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cep">CEP</Label>
            <Input id="cep" inputMode="numeric" placeholder="00000-000" disabled={pending} {...register("cep")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bairro">Bairro</Label>
            <Input id="bairro" disabled={pending} {...register("bairro")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="logradouro">Logradouro</Label>
            <Input id="logradouro" disabled={pending} {...register("logradouro")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numero">Número</Label>
            <Input id="numero" disabled={pending} {...register("numero")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="complemento">Complemento</Label>
            <Input id="complemento" disabled={pending} {...register("complemento")} />
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
          <CardTitle className="text-base">Síndico</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sindicoNome">Nome do síndico</Label>
            <Input id="sindicoNome" autoComplete="off" disabled={pending} {...register("sindicoNome")} />
          </div>
          <div className="space-y-1.5">
            <Label>Síndico profissional</Label>
            <Select value={watch("sindicoProfissional") ?? ""} onValueChange={(v) => setValue("sindicoProfissional", v ?? "")} disabled={pending}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…">
                  {(v: unknown) => (v === "true" ? "Sim" : v === "false" ? "Não" : null)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Sim</SelectItem>
                <SelectItem value="false">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp de contato *</Label>
            <Input id="whatsapp" type="tel" placeholder="+5547999999999" disabled={pending} {...register("whatsapp")} />
            {errors.whatsapp && <p className="text-xs text-destructive">{errors.whatsapp.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" disabled={pending} {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="valorCreditoReais">Valor do crédito buscado (R$)</Label>
            <Input id="valorCreditoReais" type="number" step="0.01" min="0" placeholder="300000" disabled={pending} {...register("valorCreditoReais")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prazoDesejadoMeses">Prazo desejado (meses)</Label>
            <Input id="prazoDesejadoMeses" type="number" step="1" min="1" disabled={pending} {...register("prazoDesejadoMeses")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Finalidade do crédito</Label>
            <Select value={watch("finalidade") ?? ""} onValueChange={(v) => setValue("finalidade", v ?? "")} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {FINALIDADES_CONDOMINIO.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="finalidadeDetalhes">Detalhes da finalidade</Label>
            <textarea
              id="finalidadeDetalhes"
              rows={3}
              maxLength={2000}
              disabled={pending}
              placeholder="O que será feito, se já há orçamento, urgência…"
              className="w-full rounded-md border border-border-soft bg-card px-3 py-2 text-sm text-foreground placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              {...register("finalidadeDetalhes")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saúde financeira e assembleia</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="arrecadacaoMensalReais">Arrecadação mensal (R$)</Label>
            <Input id="arrecadacaoMensalReais" type="number" step="0.01" min="0" disabled={pending} {...register("arrecadacaoMensalReais")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inadimplenciaPct">Inadimplência (%)</Label>
            <Input id="inadimplenciaPct" type="number" step="0.01" min="0" max="100" disabled={pending} {...register("inadimplenciaPct")} />
          </div>
          <div className="space-y-1.5">
            <Label>Assembleia</Label>
            <Select value={watch("assembleiaStatus") ?? ""} onValueChange={(v) => setValue("assembleiaStatus", v ?? "")} disabled={pending}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…">
                  {(v: unknown) =>
                    typeof v === "string" && v
                      ? (ASSEMBLEIA_STATUS_LABEL[v as AssembleiaStatus] ?? v)
                      : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ASSEMBLEIA_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>{ASSEMBLEIA_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canal e atribuição</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Canal de entrada</Label>
            <Select value={watch("origem") ?? "Manual"} onValueChange={(v) => setValue("origem", v ?? "")} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Manual" /></SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.source} value={s.source}>{s.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Parceiro que indicou</Label>
            <Select value={watch("parceiroId") ?? ""} onValueChange={(v) => setValue("parceiroId", v ?? "")} disabled={pending}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhum">
                  {(v: unknown) =>
                    typeof v === "string" && v && v !== SEM_PARCEIRO
                      ? (parceiros.find((p) => p.id === v)?.nome ?? v)
                      : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PARCEIRO}>Nenhum</SelectItem>
                {parceiros.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {parceiros.length === 0 && (
              <p className="text-[11px] text-fg-subtle">
                Nenhum parceiro habilitado para condomínio ainda.
              </p>
            )}
          </div>
          {isAdminOrGerente && consultores.length > 0 && (
            <div className="space-y-1.5">
              <Label>Atribuir ao consultor</Label>
              <Select value={watch("consultorId") ?? ""} onValueChange={(v) => setValue("consultorId", v ?? "")} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="Pool não-atribuído">
                    {(v: unknown) =>
                      typeof v === "string" && v
                        ? (consultores.find((c) => c.id === v)?.nome ?? v)
                        : null
                    }
                  </SelectValue>
                </SelectTrigger>
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
          Cadastrar condomínio
        </Button>
      </div>
    </form>
  );
}
