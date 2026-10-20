"use client";

import { CheckCircle2, FileDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { FINALIDADES_CONDOMINIO } from "@/lib/condominio/constants";
import { maskCnpj } from "@/lib/formatters/cpf-cnpj";

import { InputReais } from "./campos";

// Simulação de crédito para condomínio. O parceiro informa o condomínio e o
// valor; taxa e prazos são da Credios (config do admin). Gerou → baixa o PDF.

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Campo({ id, label, erro, dica, children, full }: {
  id?: string;
  label: string;
  erro?: string;
  dica?: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {erro ? (
        <p className="text-xs text-destructive">{erro}</p>
      ) : dica ? (
        <p className="text-[11px] text-muted-foreground">{dica}</p>
      ) : null}
    </div>
  );
}

export function SimulacaoForm({ valorMinimo, valorMaximo }: { valorMinimo: number; valorMaximo: number }) {
  const router = useRouter();
  const [f, setF] = useState({ nome: "", cnpj: "", valor: "", unidades: "", finalidade: "" });
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [gerada, setGerada] = useState<{ id: string; codigo: string; nome: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCampos({});
    setPending(true);
    try {
      const res = await fetch("/api/portal-parceiro/simulacoes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          condominioNome: f.nome,
          cnpj: f.cnpj,
          valorCreditoCentavos: (Number(f.valor) || 0) * 100,
          numUnidades: f.unidades ? Number(f.unidades) : null,
          finalidade: f.finalidade || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id: string; codigo: string };
        error?: string;
        campos?: Record<string, string>;
      };
      if (res.ok && json.data) {
        setGerada({ ...json.data, nome: f.nome.trim() });
        setF({ nome: "", cnpj: "", valor: "", unidades: "", finalidade: "" });
        // Baixa na hora; o cartão de sucesso fica com o link caso o navegador segure.
        window.location.href = `/api/portal-parceiro/simulacoes/${json.data.id}/pdf?download=1`;
        router.refresh();
      } else {
        setErro(json.error ?? "Não foi possível gerar a simulação.");
        setCampos(json.campos ?? {});
      }
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    }
    setPending(false);
  }

  return (
    <div className="space-y-4">
      {gerada && (
        <Alert>
          <CheckCircle2 className="size-4 text-primary" />
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>
              Simulação <strong>{gerada.codigo}</strong> gerada para {gerada.nome}.
            </span>
            <a
              href={`/api/portal-parceiro/simulacoes/${gerada.id}/pdf?download=1`}
              className={buttonVariants({ size: "sm", className: "gap-1.5" })}
            >
              <FileDown className="size-4" /> Baixar PDF
            </a>
            <a
              href={`/api/portal-parceiro/simulacoes/${gerada.id}/pdf`}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Abrir
            </a>
            <Link
              href={`/portal-parceiro/clientes/novo?simulacao=${gerada.id}`}
              prefetch={false}
              className={buttonVariants({ size: "sm", variant: "ghost" })}
            >
              Indicar este condomínio
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={submit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da simulação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="sim-nome" label="Nome do condomínio *" erro={campos.condominioNome} full>
                <Input
                  id="sim-nome"
                  value={f.nome}
                  maxLength={200}
                  placeholder="Condomínio Residencial…"
                  onChange={(e) => setF((p) => ({ ...p, nome: e.target.value }))}
                  disabled={pending}
                />
              </Campo>
              <Campo id="sim-cnpj" label="CNPJ do condomínio *" erro={campos.cnpj}>
                <Input
                  id="sim-cnpj"
                  autoComplete="off"
                  placeholder="00.000.000/0000-00"
                  value={f.cnpj}
                  onChange={(e) => setF((p) => ({ ...p, cnpj: maskCnpj(e.target.value) }))}
                  disabled={pending}
                />
              </Campo>
              <Campo
                id="sim-valor"
                label="Valor do crédito (R$) *"
                erro={campos.valorCreditoCentavos}
                dica={`De ${brl(valorMinimo)} a ${brl(valorMaximo)}.`}
              >
                <InputReais
                  id="sim-valor"
                  value={f.valor}
                  onChange={(v) => setF((p) => ({ ...p, valor: v }))}
                  disabled={pending}
                  placeholder="500.000"
                />
              </Campo>
              <Campo
                id="sim-unid"
                label="Número de unidades"
                erro={campos.numUnidades}
                dica="Opcional — mostra a parcela por unidade."
              >
                <Input
                  id="sim-unid"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={f.unidades}
                  onChange={(e) => setF((p) => ({ ...p, unidades: e.target.value.replace(/\D/g, "") }))}
                  disabled={pending}
                />
              </Campo>
              <Campo label="Finalidade" erro={campos.finalidade} dica="Opcional.">
                <Select
                  value={f.finalidade}
                  onValueChange={(v) => setF((p) => ({ ...p, finalidade: v ?? "" }))}
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINALIDADES_CONDOMINIO.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                Valores estimados pela Credios, sujeitos à análise de crédito. Não prometa
                aprovação nem condição ao cliente.
              </p>
              <Button type="submit" disabled={pending} className="gap-1.5">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                Gerar simulação em PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
