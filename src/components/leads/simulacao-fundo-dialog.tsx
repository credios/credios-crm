"use client";

import { FileDown, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import {
  buildSimulacaoFundo,
  INDEXACAO_FUNDO_LABEL,
  type IndexacaoFundo,
  IOF_TOMADOR_LABEL,
  MAX_PRAZOS_SIMULACAO_FUNDO,
  marcaSimulacaoFundo,
  PRAZO_MAX_SIMULACAO_FUNDO,
  PRAZOS_PADRAO_SIMULACAO_FUNDO,
  type ProdutoSimulacaoFundo,
  TAXA_PADRAO_SIMULACAO_FUNDO_AM,
  VALIDADE_SIMULACAO_FUNDO_DIAS,
} from "@/lib/simulador/fundo";

// ═══════════════════════════════════════════════════════════
// Simulação do fundo — valor, pré-fixada ou IPCA +, um ou mais prazos (até
// 90 meses) com a taxa de cada um e IOF opcional; o servidor calcula e
// devolve o PDF pronto pra enviar ao cliente. Abre com 6 a 60 meses a 2,3%
// a.m.; a parcela de cada linha aparece aqui antes de gerar.
// ═══════════════════════════════════════════════════════════

type Tomador = keyof typeof IOF_TOMADOR_LABEL;

export type SimulacaoFundoDefaults = {
  valorCreditoCentavos: number | null;
  produto: ProdutoSimulacaoFundo;
  /** Alíquota do IOF quando a caixinha está marcada. */
  tomador: Tomador;
};

type Linha = { key: number; meses: string; taxa: string };

/** "1,49" ou "1.49" → 1.49 (taxa não tem separador de milhar). */
const parseTaxa = (s: string) => {
  const t = s.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
};

const TAXA_PADRAO = String(TAXA_PADRAO_SIMULACAO_FUNDO_AM).replace(".", ",");

const linhasPadrao = (): Linha[] =>
  PRAZOS_PADRAO_SIMULACAO_FUNDO.map((meses, key) => ({ key, meses: String(meses), taxa: TAXA_PADRAO }));

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function nomeDoArquivo(res: Response, fallback: string) {
  const cd = res.headers.get("content-disposition") ?? "";
  return /filename="([^"]+)"/.exec(cd)?.[1] ?? fallback;
}

export function SimulacaoFundoDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadNome: string;
  defaults: SimulacaoFundoDefaults;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [valor, setValor] = useState<number>(
    defaults.valorCreditoCentavos ? Math.round(defaults.valorCreditoCentavos / 100) : 0,
  );
  // Sem IOF: cessão de crédito (condomínio) ou nota comercial (algumas PJ).
  const [comIof, setComIof] = useState(true);
  const [tomador, setTomador] = useState<Tomador>(defaults.tomador);
  const iof = comIof ? tomador : "nenhum";
  const [indexacao, setIndexacao] = useState<IndexacaoFundo>("pre");
  const [linhas, setLinhas] = useState<Linha[]>(linhasPadrao);
  const marca = marcaSimulacaoFundo(defaults.produto) === "musashi" ? "Musashi Capital" : "Credios";

  const prazos = useMemo(
    () =>
      linhas.map((l) => {
        const meses = Number(l.meses);
        const taxaAm = parseTaxa(l.taxa);
        const ok =
          Number.isInteger(meses) &&
          meses >= 1 &&
          meses <= PRAZO_MAX_SIMULACAO_FUNDO &&
          taxaAm > 0 &&
          taxaAm <= 20;
        return ok ? { meses, taxaAm } : null;
      }),
    [linhas],
  );

  // Prévia da parcela por linha (mesma conta do PDF).
  const parcelas = useMemo(() => {
    if (valor <= 0) return linhas.map(() => null);
    return prazos.map((p) => {
      if (!p) return null;
      const sim = buildSimulacaoFundo(
        {
          valorCredito: valor,
          prazos: [p],
          indexacao,
          iof,
          produto: "CGI",
          cliente: { nome: "" },
          contato: { nome: "" },
        },
        { codigo: "", geradaEm: "2000-01-01" },
      );
      return sim.linhas[0]!.parcela;
    });
  }, [valor, prazos, indexacao, iof, linhas]);

  function atualizar(key: number, campo: "meses" | "taxa", v: string) {
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: v } : l)));
  }

  function adicionar() {
    setLinhas((ls) => {
      const ultima = ls[ls.length - 1];
      const key = Math.max(...ls.map((l) => l.key)) + 1;
      return [...ls, { key, meses: "", taxa: ultima?.taxa ?? TAXA_PADRAO }];
    });
  }

  async function gerar() {
    if (valor <= 0) return toast.error("Informe o valor do crédito");
    const idx = prazos.findIndex((p) => p === null);
    if (idx >= 0) {
      return toast.error(`Confira o prazo ${idx + 1}`, {
        description: `Prazo de 1 a ${PRAZO_MAX_SIMULACAO_FUNDO} meses e taxa maior que zero (até 20% a.m.).`,
      });
    }

    setPending(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/simulacao-fundo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ valorCredito: valor, prazos, indexacao, iof }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error("Falha ao gerar a simulação", {
          description: typeof json.error === "string" ? json.error : "Tente novamente.",
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeDoArquivo(res, "Simulacao.pdf");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      toast.success(`Simulação ${res.headers.get("x-simulacao-codigo") ?? ""} gerada`, {
        description: `PDF baixado, válido por ${VALIDADE_SIMULACAO_FUNDO_DIAS} dias. Registrado no histórico do lead.`,
      });
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error("[simulacao-fundo] erro:", err);
      toast.error("Erro de rede ao gerar a simulação");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Simulação do fundo</DialogTitle>
          <DialogDescription>
            PDF com a marca da {marca} para <strong>{leadNome}</strong>. Tabela Price,
            prazo de até {PRAZO_MAX_SIMULACAO_FUNDO} meses, válido por {VALIDADE_SIMULACAO_FUNDO_DIAS} dias.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="simf-valor">Valor do crédito (R$)</Label>
              <Input
                id="simf-valor"
                inputMode="numeric"
                value={valor ? valor.toLocaleString("pt-BR") : ""}
                onChange={(e) => setValor(Number(e.currentTarget.value.replace(/\D/g, "")) || 0)}
                placeholder="500.000"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Taxa</Label>
              <Select
                value={indexacao}
                onValueChange={(v) => setIndexacao((v ?? "pre") as IndexacaoFundo)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: unknown) => INDEXACAO_FUNDO_LABEL[v as IndexacaoFundo]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INDEXACAO_FUNDO_LABEL) as IndexacaoFundo[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {INDEXACAO_FUNDO_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={comIof}
                  onCheckedChange={(v) => setComIof(v === true)}
                  disabled={pending}
                />
                Adicionar IOF (Decreto 12.499/2025)
              </Label>
              {comIof ? (
                <Select value={tomador} onValueChange={(v) => setTomador((v ?? "PF") as Tomador)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: unknown) => IOF_TOMADOR_LABEL[v as Tomador]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(IOF_TOMADOR_LABEL) as Tomador[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {IOF_TOMADOR_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Sem IOF — para cessão de crédito ou nota comercial.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1.3fr_2rem] gap-2 text-xs font-medium text-muted-foreground">
              <span>Prazo (meses)</span>
              <span>{indexacao === "ipca" ? "IPCA + (% a.m.)" : "Juros (% a.m.)"}</span>
              <span className="text-right">{indexacao === "ipca" ? "Parcela (hoje)" : "Parcela"}</span>
              <span />
            </div>
            {linhas.map((l, i) => (
              <div key={l.key} className="grid grid-cols-[1fr_1fr_1.3fr_2rem] items-center gap-2">
                <Input
                  aria-label={`Prazo ${i + 1} em meses`}
                  inputMode="numeric"
                  value={l.meses}
                  onChange={(e) => atualizar(l.key, "meses", e.currentTarget.value.replace(/\D/g, ""))}
                  placeholder={String(PRAZO_MAX_SIMULACAO_FUNDO)}
                  disabled={pending}
                />
                <Input
                  aria-label={`Taxa de juros ${i + 1} ao mês`}
                  inputMode="decimal"
                  value={l.taxa}
                  onChange={(e) => atualizar(l.key, "taxa", e.currentTarget.value.replace(/[^\d,.]/g, ""))}
                  placeholder={TAXA_PADRAO}
                  disabled={pending}
                />
                <span className="text-right font-mono text-sm tabular-nums">
                  {parcelas[i] != null ? brl(parcelas[i]!) : "—"}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover prazo ${i + 1}`}
                  onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
                  disabled={pending || linhas.length === 1}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={adicionar}
              disabled={pending || linhas.length >= MAX_PRAZOS_SIMULACAO_FUNDO}
            >
              <Plus className="size-4" /> Adicionar prazo
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Até {MAX_PRAZOS_SIMULACAO_FUNDO} prazos de no máximo {PRAZO_MAX_SIMULACAO_FUNDO} meses,
              cada um com a sua taxa.
              {iof !== "nenhum" && " A parcela já inclui o IOF financiado."}
              {indexacao === "ipca" && " No IPCA +, a parcela é corrigida mês a mês pela inflação."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={gerar} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            {pending ? "Gerando…" : "Gerar PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
