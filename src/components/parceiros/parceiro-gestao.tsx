"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ComissaoAcoes } from "@/components/parceiros/comissao-acoes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatBrlFromCents } from "@/lib/formatters/currency";
import {
  COMISSAO_STATUS_LABEL,
  type ComissaoStatus,
} from "@/lib/parceiros/constants";
import {
  PRODUTO_LABEL,
  PRODUTO_LABEL_CURTO,
  PRODUTOS_ATIVOS,
  type Produto,
} from "@/lib/produtos";

// Gestão comercial do parceiro: produtos que ele pode indicar, dados de
// pagamento e comissões por operação. Escrita é só do admin (a API barra).

function pctDeBps(bps: number | null): string {
  return bps == null
    ? ""
    : (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function bpsDePct(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : null;
}

function centavosDeReais(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

// ============================================================================
// Cadastro comercial
// ============================================================================

type GestaoDados = {
  id: string;
  produtosHabilitados: string[];
  pixChave: string | null;
  comissaoPadraoBps: number | null;
};

export function ParceiroGestaoComercial({
  parceiro,
  canEdit,
}: {
  parceiro: GestaoDados;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [produtos, setProdutos] = useState<string[]>(parceiro.produtosHabilitados);
  const [pix, setPix] = useState(parceiro.pixChave ?? "");
  const [comissao, setComissao] = useState(pctDeBps(parceiro.comissaoPadraoBps));

  function abrir() {
    setProdutos(parceiro.produtosHabilitados);
    setPix(parceiro.pixChave ?? "");
    setComissao(pctDeBps(parceiro.comissaoPadraoBps));
    setOpen(true);
  }

  async function salvar() {
    if (produtos.length === 0) {
      toast.error("Habilite pelo menos um produto.");
      return;
    }
    if (comissao.trim() && bpsDePct(comissao) == null) {
      toast.error("Comissão padrão deve ficar entre 0 e 100%.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/parceiros/${parceiro.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          produtosHabilitados: produtos,
          pixChave: pix.trim() || null,
          comissaoPadraoBps: bpsDePct(comissao),
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(json.error ?? "Não consegui salvar.");
        setBusy(false);
        return;
      }
      toast.success("Gestão comercial atualizada.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Gestão comercial</CardTitle>
        {canEdit && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={abrir}>
            <Pencil className="size-3.5" /> Editar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Produtos habilitados</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {parceiro.produtosHabilitados.map((p) => (
                <Badge key={p} variant="soft">
                  {PRODUTO_LABEL[p as Produto] ?? p}
                </Badge>
              ))}
            </dd>
          </div>
          {canEdit && (
            <>
              <div>
                <dt className="text-xs text-muted-foreground">Chave PIX</dt>
                <dd className="font-medium">{parceiro.pixChave ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Comissão padrão</dt>
                <dd className="font-medium">
                  {parceiro.comissaoPadraoBps != null
                    ? `${pctDeBps(parceiro.comissaoPadraoBps)}%`
                    : "Caso a caso"}
                </dd>
              </div>
            </>
          )}
        </dl>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestão comercial</DialogTitle>
            <DialogDescription>
              O parceiro só pode indicar clientes dos produtos habilitados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Produtos habilitados</Label>
              {PRODUTOS_ATIVOS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={produtos.includes(p)}
                    onCheckedChange={(v) =>
                      setProdutos((prev) =>
                        v === true
                          ? Array.from(new Set([...prev, p]))
                          : prev.filter((x) => x !== p),
                      )
                    }
                    disabled={busy}
                  />
                  {PRODUTO_LABEL[p]}
                </label>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-pix">Chave PIX</Label>
              <Input id="pg-pix" value={pix} onChange={(e) => setPix(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-com">Comissão padrão (%)</Label>
              <Input
                id="pg-com"
                inputMode="decimal"
                placeholder="Em branco = caso a caso"
                value={comissao}
                onChange={(e) => setComissao(e.target.value)}
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground">
                Só pré-preenche o registro de comissão; o valor de cada operação é
                definido na hora.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={busy}>
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================================
// Comissões (admin)
// ============================================================================

export type IndicacaoRow = {
  leadId: string;
  nome: string;
  produto: string;
  status: string;
  valorCreditoCentavos: number | null;
  valorLiberadoCentavos: number | null;
};

export type ComissaoRow = {
  id: string;
  leadId: string | null;
  leadNome: string | null;
  descricao: string | null;
  baseCentavos: number | null;
  percentualBps: number | null;
  valorCentavos: number;
  status: string;
  pagoEm: string | null;
  observacao: string | null;
  vencimento: string | null;
  temComprovante: boolean;
  temNota: boolean;
};

function dataBr(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function ParceiroComissoes({
  parceiroId,
  comissaoPadraoBps,
  pixChave,
  indicacoes,
  comissoes,
}: {
  parceiroId: string;
  comissaoPadraoBps: number | null;
  pixChave: string | null;
  indicacoes: IndicacaoRow[];
  comissoes: ComissaoRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [base, setBase] = useState("");
  const [pct, setPct] = useState("");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");

  // Operações que ainda não têm comissão ativa.
  const comComissao = new Set(comissoes.map((c) => c.leadId).filter(Boolean));
  const disponiveis = indicacoes.filter((i) => !comComissao.has(i.leadId));

  function abrir() {
    setLeadId("");
    setBase("");
    setPct(pctDeBps(comissaoPadraoBps));
    setValor("");
    setObs("");
    setOpen(true);
  }

  function escolherLead(id: string) {
    setLeadId(id);
    const ind = indicacoes.find((i) => i.leadId === id);
    const b = ind?.valorLiberadoCentavos ?? ind?.valorCreditoCentavos ?? null;
    setBase(b != null ? String(b / 100) : "");
    setValor("");
  }

  const baseC = centavosDeReais(base);
  const pctBps = bpsDePct(pct);
  const calculado =
    baseC != null && pctBps != null ? Math.round((baseC * pctBps) / 10_000) : null;

  async function registrar() {
    const valorC = centavosDeReais(valor);
    if (!leadId) {
      toast.error("Escolha a operação.");
      return;
    }
    if (valorC == null && calculado == null) {
      toast.error("Informe o valor, ou a base e o percentual.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/parceiros/${parceiroId}/comissoes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId,
          // Valor digitado manda: base/percentual só vão junto quando o valor
          // é o calculado (senão a API recusa por não conferirem).
          ...(valorC != null
            ? { valorCentavos: valorC }
            : { baseCentavos: baseC, percentualBps: pctBps }),
          observacao: obs.trim() || null,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(json.error ?? "Não consegui registrar.");
        setBusy(false);
        return;
      }
      toast.success("Comissão registrada.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    }
    setBusy(false);
  }

  const aPagar = comissoes
    .filter((c) => c.status === "prevista" || c.status === "a_pagar")
    .reduce((s, c) => s + c.valorCentavos, 0);
  const pago = comissoes
    .filter((c) => c.status === "paga")
    .reduce((s, c) => s + c.valorCentavos, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Comissões</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={abrir}
          disabled={disponiveis.length === 0}
        >
          <Plus className="size-3.5" /> Registrar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Em aberto: <span className="font-medium text-foreground">{formatBrlFromCents(aPagar)}</span>
          {" · "}Pago: <span className="font-medium text-foreground">{formatBrlFromCents(pago)}</span>
        </p>
        {comissoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma comissão registrada.
            {disponiveis.length === 0 && " Não há indicações sem comissão."}
          </p>
        ) : (
          <ul className="divide-y">
            {comissoes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {c.leadId ? (
                      <Link href={`/leads/${c.leadId}`} className="hover:underline">
                        {c.leadNome ?? "Operação"}
                      </Link>
                    ) : (
                      (c.descricao ?? "Comissão avulsa")
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.baseCentavos != null && c.percentualBps != null
                      ? `${pctDeBps(c.percentualBps)}% sobre ${formatBrlFromCents(c.baseCentavos)}`
                      : "Valor definido caso a caso"}
                    {c.pagoEm ? ` · paga em ${dataBr(c.pagoEm)}` : ""}
                    {!c.pagoEm && c.vencimento ? ` · vence em ${dataBr(c.vencimento)}` : ""}
                    {c.observacao ? ` · ${c.observacao}` : ""}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">
                  {formatBrlFromCents(c.valorCentavos)}
                </span>
                <Badge variant={c.status === "paga" ? "default" : "outline"}>
                  {COMISSAO_STATUS_LABEL[c.status as ComissaoStatus] ?? c.status}
                </Badge>
                <ComissaoAcoes
                  c={{
                    id: c.id,
                    parceiroId,
                    status: c.status,
                    valorCentavos: c.valorCentavos,
                    rotulo: c.leadNome ?? c.descricao ?? "Comissão",
                    pixChave,
                    temComprovante: c.temComprovante,
                    temNota: c.temNota,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar comissão</DialogTitle>
            <DialogDescription>
              Informe o valor direto, ou a base e o percentual para calcular.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Operação</Label>
              <Select value={leadId} onValueChange={(v) => escolherLead(v ?? "")} disabled={busy}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a indicação">
                    {(v: unknown) =>
                      typeof v === "string" && v
                        ? (indicacoes.find((i) => i.leadId === v)?.nome ?? v)
                        : null
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {disponiveis.map((i) => (
                    <SelectItem key={i.leadId} value={i.leadId}>
                      {i.nome} · {PRODUTO_LABEL_CURTO[i.produto as Produto] ?? i.produto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm-base">Base (R$)</Label>
              <Input id="cm-base" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm-pct">Percentual (%)</Label>
              <Input id="cm-pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cm-valor">Valor da comissão (R$)</Label>
              <Input
                id="cm-valor"
                inputMode="decimal"
                placeholder={
                  calculado != null
                    ? `Calculado: ${formatBrlFromCents(calculado)}`
                    : "Informe o valor"
                }
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground">
                Em branco usa o valor calculado. Se preencher, vale o digitado.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cm-obs">Observação</Label>
              <Textarea id="cm-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} disabled={busy} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void registrar()} disabled={busy}>
              {busy ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
