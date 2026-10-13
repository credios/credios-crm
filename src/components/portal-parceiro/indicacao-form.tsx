"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FINALIDADES_CONDOMINIO } from "@/lib/condominio/constants";
import { UFS } from "@/lib/constants";
import { maskCnpj, maskCpfCnpj } from "@/lib/formatters/cpf-cnpj";
import { TIPOS_IMOVEL_PARCEIRO } from "@/lib/portal-parceiro/prequal";
import { PRODUTO_LABEL, type Produto } from "@/lib/produtos";

// Indicação de cliente pelo parceiro. O formulário muda conforme o produto;
// a política de crédito (pisos, LTV, renda) é validada no servidor, que
// devolve os erros por campo.

function centavos(s: string): number {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function Campo({
  id,
  label,
  erro,
  children,
  full,
  dica,
}: {
  id?: string;
  label: string;
  erro?: string;
  children: React.ReactNode;
  full?: boolean;
  dica?: string;
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

export function IndicacaoForm({ produtos }: { produtos: string[] }) {
  const router = useRouter();
  const [produto, setProduto] = useState(produtos[0] ?? "CGI");
  const [f, setF] = useState({
    nome: "",
    documento: "",
    whatsapp: "",
    email: "",
    cidade: "",
    estado: "",
    valorCredito: "",
    observacoes: "",
    // CGI
    tipoImovel: "",
    valorImovel: "",
    rendaTitular: "",
    rendaConjuge: "",
    saldoDevedor: "",
    // Condomínio
    sindicoNome: "",
    finalidade: "",
    numUnidades: "",
    administradora: "",
  });
  const [consentimento, setConsentimento] = useState(false);
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [duplicada, setDuplicada] = useState<string | null>(null);

  const cond = produto === "CONDOMINIO";
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));
  // O servidor nomeia os campos monetários com sufixo Centavos.
  const err = (k: string) => campos[k] ?? campos[`${k}Centavos`];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCampos({});
    setDuplicada(null);
    if (!consentimento) {
      setErro("Confirme que você tem autorização do cliente para compartilhar os dados.");
      return;
    }
    setPending(true);

    const comum = {
      produto,
      nome: f.nome,
      documento: f.documento,
      whatsapp: f.whatsapp,
      email: f.email || null,
      cidade: f.cidade || null,
      estado: f.estado || null,
      valorCreditoCentavos: centavos(f.valorCredito),
      observacoes: f.observacoes || null,
      consentimento: true,
    };
    const corpo = cond
      ? {
          ...comum,
          sindicoNome: f.sindicoNome,
          finalidade: f.finalidade,
          numUnidades: f.numUnidades ? Number(f.numUnidades) : null,
          administradora: f.administradora || null,
        }
      : {
          ...comum,
          tipoImovel: f.tipoImovel,
          valorImovelCentavos: centavos(f.valorImovel),
          rendaTitularCentavos: centavos(f.rendaTitular),
          rendaConjugeCentavos: centavos(f.rendaConjuge),
          saldoDevedorCentavos: centavos(f.saldoDevedor),
        };

    try {
      const res = await fetch("/api/portal-parceiro/clientes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id: string };
        error?: string;
        campos?: Record<string, string>;
        duplicada?: string;
      };
      if (res.ok && json.data) {
        router.push(`/portal-parceiro/clientes/${json.data.id}`);
        router.refresh();
        return;
      }
      setErro(json.error ?? "Não foi possível enviar a indicação.");
      setCampos(json.campos ?? {});
      setDuplicada(json.duplicada ?? null);
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>
            {erro}{" "}
            {duplicada && (
              <Link href={`/portal-parceiro/clientes/${duplicada}`} className="underline">
                Ver a indicação
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      {produtos.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produto</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={produto} onValueChange={(v) => v && setProduto(v)} disabled={pending}>
              <SelectTrigger className="sm:w-96">
                <SelectValue>
                  {(v: unknown) => PRODUTO_LABEL[v as Produto] ?? String(v ?? "")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {produtos.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRODUTO_LABEL[p as Produto] ?? p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{cond ? "Condomínio" : "Cliente"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo id="in-nome" label={cond ? "Nome do condomínio *" : "Nome completo *"} erro={err("nome")} full>
            <Input id="in-nome" value={f.nome} onChange={set("nome")} disabled={pending} />
          </Campo>
          <Campo id="in-doc" label={cond ? "CNPJ *" : "CPF ou CNPJ *"} erro={err("documento")}>
            <Input
              id="in-doc"
              inputMode="numeric"
              autoComplete="off"
              value={f.documento}
              onChange={(e) =>
                setF((p) => ({
                  ...p,
                  documento: cond ? maskCnpj(e.target.value) : maskCpfCnpj(e.target.value),
                }))
              }
              disabled={pending}
            />
          </Campo>
          {cond && (
            <Campo id="in-sind" label="Nome do síndico *" erro={err("sindicoNome")}>
              <Input id="in-sind" value={f.sindicoNome} onChange={set("sindicoNome")} disabled={pending} />
            </Campo>
          )}
          <Campo id="in-wa" label={cond ? "WhatsApp do síndico *" : "WhatsApp *"} erro={err("whatsapp")}>
            <Input id="in-wa" type="tel" placeholder="(00) 00000-0000" value={f.whatsapp} onChange={set("whatsapp")} disabled={pending} />
          </Campo>
          <Campo id="in-email" label="E-mail" erro={err("email")}>
            <Input id="in-email" type="email" value={f.email} onChange={set("email")} disabled={pending} />
          </Campo>
          <Campo id="in-cidade" label="Cidade" erro={err("cidade")}>
            <Input id="in-cidade" value={f.cidade} onChange={set("cidade")} disabled={pending} />
          </Campo>
          <Campo label="UF" erro={err("estado")}>
            <Select value={f.estado} onValueChange={(v) => setF((p) => ({ ...p, estado: v ?? "" }))} disabled={pending}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          {cond && (
            <>
              <Campo id="in-unid" label="Número de unidades" erro={err("numUnidades")}>
                <Input id="in-unid" type="number" min="1" step="1" value={f.numUnidades} onChange={set("numUnidades")} disabled={pending} />
              </Campo>
              <Campo id="in-adm" label="Administradora" erro={err("administradora")}>
                <Input id="in-adm" value={f.administradora} onChange={set("administradora")} disabled={pending} />
              </Campo>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo id="in-credito" label="Crédito desejado (R$) *" erro={err("valorCredito")}>
            <Input id="in-credito" inputMode="decimal" placeholder="300000" value={f.valorCredito} onChange={set("valorCredito")} disabled={pending} />
          </Campo>
          {cond ? (
            <Campo label="Finalidade do crédito *" erro={err("finalidade")}>
              <Select value={f.finalidade} onValueChange={(v) => setF((p) => ({ ...p, finalidade: v ?? "" }))} disabled={pending}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {FINALIDADES_CONDOMINIO.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
          ) : (
            <>
              <Campo label="Tipo do imóvel *" erro={err("tipoImovel")}>
                <Select value={f.tipoImovel} onValueChange={(v) => setF((p) => ({ ...p, tipoImovel: v ?? "" }))} disabled={pending}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_IMOVEL_PARCEIRO.map((t) => (
                      <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo id="in-imovel" label="Valor do imóvel (R$) *" erro={err("valorImovel")}>
                <Input id="in-imovel" inputMode="decimal" placeholder="800000" value={f.valorImovel} onChange={set("valorImovel")} disabled={pending} />
              </Campo>
              <Campo id="in-saldo" label="Saldo devedor do imóvel (R$)" erro={err("saldoDevedor")} dica="Deixe em branco se o imóvel está quitado.">
                <Input id="in-saldo" inputMode="decimal" value={f.saldoDevedor} onChange={set("saldoDevedor")} disabled={pending} />
              </Campo>
              <Campo id="in-renda" label="Renda mensal do titular (R$) *" erro={err("rendaTitular")}>
                <Input id="in-renda" inputMode="decimal" value={f.rendaTitular} onChange={set("rendaTitular")} disabled={pending} />
              </Campo>
              <Campo id="in-renda2" label="Renda do cônjuge (R$)" erro={err("rendaConjuge")} dica="Só se compõe renda.">
                <Input id="in-renda2" inputMode="decimal" value={f.rendaConjuge} onChange={set("rendaConjuge")} disabled={pending} />
              </Campo>
            </>
          )}
          <Campo id="in-obs" label="Observações" erro={err("observacoes")} full>
            <Textarea id="in-obs" rows={3} maxLength={2000} value={f.observacoes} onChange={set("observacoes")} disabled={pending} placeholder="Contexto que ajude a equipe: urgência, melhor horário de contato…" />
          </Campo>
        </CardContent>
      </Card>

      <label className="flex items-start gap-2 text-sm leading-snug cursor-pointer">
        <Checkbox checked={consentimento} onCheckedChange={(v) => setConsentimento(v === true)} disabled={pending} className="mt-0.5" />
        <span>
          Confirmo que tenho autorização do cliente para compartilhar estes dados com a
          Credios para análise de crédito.
        </span>
      </label>

      <div className="flex items-center justify-end gap-3">
        <Link href="/portal-parceiro/clientes" className="text-sm text-muted-foreground hover:text-foreground">
          Cancelar
        </Link>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Enviar indicação
        </Button>
      </div>
    </form>
  );
}
