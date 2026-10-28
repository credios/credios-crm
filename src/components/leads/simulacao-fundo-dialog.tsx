"use client";

import { FileDown, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  IOF_FUNDO_LABEL,
  type IofFundo,
  MAX_PRAZOS_SIMULACAO_FUNDO,
  VALIDADE_SIMULACAO_FUNDO_DIAS,
} from "@/lib/simulador/fundo";

// ═══════════════════════════════════════════════════════════
// Simulação do fundo (Musashi Capital) — valor, um ou mais prazos com a
// taxa de cada um e IOF; o servidor calcula e devolve o PDF pronto pra
// enviar ao cliente. A parcela de cada linha aparece aqui antes de gerar.
// ═══════════════════════════════════════════════════════════

export type SimulacaoFundoDefaults = {
  valorCreditoCentavos: number | null;
  iof: IofFundo;
  prazoSugeridoMeses: number | null;
};

type Linha = { key: number; meses: string; taxa: string };

/** "1,49" ou "1.49" → 1.49 (taxa não tem separador de milhar). */
const parseTaxa = (s: string) => {
  const t = s.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
};

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
  const [iof, setIof] = useState<IofFundo>(defaults.iof);
  const [linhas, setLinhas] = useState<Linha[]>([
    { key: 0, meses: defaults.prazoSugeridoMeses ? String(defaults.prazoSugeridoMeses) : "", taxa: "" },
  ]);

  const prazos = useMemo(
    () =>
      linhas.map((l) => {
        const meses = Number(l.meses);
        const taxaAm = parseTaxa(l.taxa);
        const ok = Number.isInteger(meses) && meses >= 1 && meses <= 420 && taxaAm > 0 && taxaAm <= 20;
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
          iof,
          produto: "CGI",
          cliente: { nome: "" },
          contato: { nome: "" },
        },
        { codigo: "", geradaEm: "2000-01-01" },
      );
      return sim.linhas[0]!.parcela;
    });
  }, [valor, prazos, iof, linhas]);

  function atualizar(key: number, campo: "meses" | "taxa", v: string) {
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: v } : l)));
  }

  function adicionar() {
    setLinhas((ls) => {
      const ultima = ls[ls.length - 1];
      const key = Math.max(...ls.map((l) => l.key)) + 1;
      return [...ls, { key, meses: "", taxa: ultima?.taxa ?? "" }];
    });
  }

  async function gerar() {
    if (valor <= 0) return toast.error("Informe o valor do crédito");
    const idx = prazos.findIndex((p) => p === null);
    if (idx >= 0) {
      return toast.error(`Confira o prazo ${idx + 1}`, {
        description: "Prazo de 1 a 420 meses e taxa maior que zero (até 20% a.m.).",
      });
    }

    setPending(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/simulacao-fundo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ valorCredito: valor, prazos, iof }),
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
      a.download = nomeDoArquivo(res, "Simulacao_Musashi_Capital.pdf");
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Simulação do fundo</DialogTitle>
          <DialogDescription>
            PDF com a marca da Musashi Capital para <strong>{leadNome}</strong>. Tabela Price,
            válido por {VALIDADE_SIMULACAO_FUNDO_DIAS} dias.
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
              <Label>IOF</Label>
              <Select value={iof} onValueChange={(v) => setIof((v ?? "PF") as IofFundo)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: unknown) => IOF_FUNDO_LABEL[v as IofFundo]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(IOF_FUNDO_LABEL) as IofFundo[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {IOF_FUNDO_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1.3fr_2rem] gap-2 text-xs font-medium text-muted-foreground">
              <span>Prazo (meses)</span>
              <span>Juros (% a.m.)</span>
              <span className="text-right">Parcela</span>
              <span />
            </div>
            {linhas.map((l, i) => (
              <div key={l.key} className="grid grid-cols-[1fr_1fr_1.3fr_2rem] items-center gap-2">
                <Input
                  aria-label={`Prazo ${i + 1} em meses`}
                  inputMode="numeric"
                  value={l.meses}
                  onChange={(e) => atualizar(l.key, "meses", e.currentTarget.value.replace(/\D/g, ""))}
                  placeholder="60"
                  disabled={pending}
                />
                <Input
                  aria-label={`Taxa de juros ${i + 1} ao mês`}
                  inputMode="decimal"
                  value={l.taxa}
                  onChange={(e) => atualizar(l.key, "taxa", e.currentTarget.value.replace(/[^\d,.]/g, ""))}
                  placeholder="1,49"
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
              Até {MAX_PRAZOS_SIMULACAO_FUNDO} prazos, cada um com a sua taxa.
              {iof !== "nenhum" && " A parcela já inclui o IOF financiado."}
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
