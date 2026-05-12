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
  SITUACOES_IMOVEL,
  TIPOS_IMOVEL,
  TIPOS_PESSOA,
  UFS,
} from "@/lib/constants";
import {
  detectKind,
  digitsOnly,
  isValidCpfOrCnpj,
  maskCpfCnpj,
} from "@/lib/formatters/cpf-cnpj";

// Schema simplificado: todos os campos como string opcional. Coerção numérica
// e mapeamento snake/camel acontecem no submit.
const formSchema = z.object({
  nome: z.string().trim().min(2, "Mínimo 2 caracteres"),
  // CPF/CNPJ é OPCIONAL. Se preenchido, valida pelo algoritmo da Receita.
  cpf: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.trim() === "" || isValidCpfOrCnpj(v),
      "CPF ou CNPJ inválido",
    ),
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
  tipoImovelDetalhes: z.string().optional(),
  situacaoImovel: z.string().optional(),
  tipoPessoa: z.string().optional(),
  valorImovelReais: z.string().optional(),
  saldoDevedorReais: z.string().optional(),
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
  /** Sources ativos da tabela tracking_sources (carregado pelo server component pai). */
  sources: Array<{ source: string; channel: string; displayName: string; ordem: number }>;
};

export function LeadCreateForm({ currentUser, consultores, sources }: Props) {
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
      // Server espera só dígitos. Form mostra com máscara, salva dígitos puros.
      cpf: values.cpf?.trim() ? digitsOnly(values.cpf) : null,
      estadoCivil: values.estadoCivil || null,
      ocupacao: values.ocupacao || null,
      rendaMensalCentavos: reaisToCents(values.rendaMensalReais),
      whatsapp: values.whatsapp.trim(),
      email: values.email?.trim() || null,
      cidade: values.cidade?.trim() || null,
      estado: values.estado || null,
      objetivoCredito: values.objetivoCredito || null,
      tipoImovel: values.tipoImovel || null,
      // Esclarecimento só vai junto se o tipo for Terreno/Outro.
      tipoImovelDetalhes:
        values.tipoImovel === "Terreno" || values.tipoImovel === "Outro"
          ? (values.tipoImovelDetalhes?.trim() || null)
          : null,
      situacaoImovel: values.situacaoImovel || null,
      tipoPessoa: values.tipoPessoa || null,
      valorImovelCentavos: reaisToCents(values.valorImovelReais),
      // Saldo devedor só faz sentido quando o imóvel está financiado;
      // para "Quitado" envia null para evitar dado órfão.
      saldoDevedorCentavos:
        values.situacaoImovel === "Financiado"
          ? reaisToCents(values.saldoDevedorReais)
          : null,
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
            <Label htmlFor="cpf">
              CPF / CNPJ
              <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                opcional
              </span>
            </Label>
            <Input
              id="cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              disabled={pending}
              {...register("cpf", {
                onChange: (e) => {
                  // Máscara dinâmica: até 11 dígitos formata como CPF, depois CNPJ.
                  const masked = maskCpfCnpj(e.currentTarget.value);
                  setValue("cpf", masked, { shouldValidate: true });
                },
              })}
            />
            <CpfCnpjHint value={watch("cpf") ?? ""} error={errors.cpf?.message} />
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
          {/* Esclarecimento condicional — Terreno e Outro exigem mais
              contexto pois têm aceitação restrita por banco. */}
          {(watch("tipoImovel") === "Terreno" || watch("tipoImovel") === "Outro") && (
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="tipoImovelDetalhes">
                Esclarecimento sobre o imóvel
              </Label>
              <textarea
                id="tipoImovelDetalhes"
                disabled={pending}
                rows={3}
                maxLength={2000}
                placeholder={watch("tipoImovel") === "Terreno"
                  ? "Localização, tamanho, se é em condomínio, benfeitorias..."
                  : "Tipo do imóvel (galpão, fazenda etc.), localização e principais características..."}
                className="w-full rounded-md border border-border-soft bg-card px-3 py-2 text-sm text-foreground placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                {...register("tipoImovelDetalhes")}
              />
              <p className="text-[11px] text-fg-subtle leading-relaxed">
                Detalhe necessário para triagem — Terreno e Outro têm aceitação restrita.
              </p>
            </div>
          )}
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
          {/* Saldo devedor só aparece se "Financiado" — para imóveis quitados
              o campo é irrelevante e some pra simplificar o form. */}
          {watch("situacaoImovel") === "Financiado" && (
            <div className="space-y-1.5">
              <Label htmlFor="saldoDevedorReais">Saldo devedor (R$)</Label>
              <Input
                id="saldoDevedorReais"
                type="number"
                step="0.01"
                min="0"
                placeholder="150000"
                disabled={pending}
                {...register("saldoDevedorReais")}
              />
              <p className="text-[11px] text-muted-foreground">
                Quanto ainda falta pagar do financiamento atual do imóvel.
              </p>
            </div>
          )}
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
                {sources.map((s) => (
                  <SelectItem key={s.source} value={s.source}>
                    {s.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdminOrGerente && consultores.length > 0 && (
            <div className="space-y-1.5">
              <Label>Atribuir ao consultor</Label>
              <Select value={watch("consultorId") ?? ""} onValueChange={(v) => setValue("consultorId", v ?? "")} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="Pool não-atribuído">
                    {(v: unknown) =>
                      typeof v === "string" && v
                        ? consultores.find((c) => c.id === v)?.nome ?? v
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
          Criar lead
        </Button>
      </div>
    </form>
  );
}

/**
 * Hint contextual abaixo do input de CPF/CNPJ:
 *  - Vazio: nenhum aviso
 *  - Dígitos < 11: mostra "11 dígitos pra CPF, 14 pra CNPJ"
 *  - 11 ou 14 dígitos com erro: mensagem de invalidez
 *  - 11 ou 14 dígitos válido: confirma "CPF válido" / "CNPJ válido"
 */
function CpfCnpjHint({
  value,
  error,
}: {
  value: string;
  error?: string;
}) {
  const d = digitsOnly(value);
  const kind = detectKind(value);

  if (!d) {
    return (
      <p className="text-[11px] text-fg-subtle">
        Opcional. Aceita CPF (11 dígitos) ou CNPJ (14).
      </p>
    );
  }

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }

  if (kind === "unknown") {
    return (
      <p className="text-[11px] text-fg-subtle">
        Continue digitando · {d.length}/{d.length < 11 ? "11 (CPF)" : "14 (CNPJ)"}
      </p>
    );
  }

  // 11 ou 14 dígitos sem erro = válido
  return (
    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
      ✓ {kind === "cpf" ? "CPF" : "CNPJ"} válido
    </p>
  );
}
