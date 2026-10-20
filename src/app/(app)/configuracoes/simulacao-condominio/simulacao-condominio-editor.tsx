"use client";

import { Building2, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { InputReais } from "@/components/portal-parceiro/campos";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { anualiza, buildSimulacaoCondominio } from "@/lib/simulador/condominio";
import {
  MAX_PRAZOS,
  type SimulacaoCondominioConfig,
} from "@/lib/simulador/condominio-config";

// Editor da simulação de condomínio (admin). Cada prazo tem a própria taxa;
// a coluna de exemplo recalcula na hora com o mesmo motor do PDF, pra o admin
// ver o efeito antes de salvar.

type Linha = { key: number; meses: string; taxa: string };

const num = (s: string) => Number(s.trim().replace(/\./g, "").replace(",", "."));
const taxaNum = (s: string) => Number(s.trim().replace(",", "."));
const fmtPct = (v: number) => v.toFixed(2).replace(".", ",") + "%";
const fmtBrl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const decimal = (v: number) => String(v).replace(".", ",");

let seq = 0;

export function SimulacaoCondominioEditor({ initial }: { initial: SimulacaoCondominioConfig }) {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    initial.prazos.map((p) => ({ key: seq++, meses: String(p.meses), taxa: decimal(p.taxaAm) })),
  );
  const [validade, setValidade] = useState(String(initial.validadeDias));
  const [iofAd, setIofAd] = useState(decimal(initial.iofAdicionalPct));
  const [iofDia, setIofDia] = useState(decimal(initial.iofDiarioPct));
  const [minimo, setMinimo] = useState(String(Math.round(initial.valorMinimo)));
  const [maximo, setMaximo] = useState(String(Math.round(initial.valorMaximo)));
  const [exemplo, setExemplo] = useState("500000");
  const [taxaTodos, setTaxaTodos] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key: number, campo: "meses" | "taxa", v: string) =>
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: v } : l)));

  // Prévia: só linhas válidas, mesmo motor do PDF.
  const previa = useMemo(() => {
    const valor = Number(exemplo) || 0;
    const ad = taxaNum(iofAd);
    const dia = taxaNum(iofDia);
    const mapa = new Map<number, { parcela: number; cet: number }>();
    if (!(valor > 0) || !(ad >= 0) || !(dia >= 0)) return mapa;
    for (const l of linhas) {
      const meses = num(l.meses);
      const taxa = taxaNum(l.taxa);
      if (!Number.isInteger(meses) || meses < 1 || !(taxa > 0)) continue;
      const r = buildSimulacaoCondominio(
        { condominioNome: "-", cnpj: "", valorCredito: valor, parceiro: { nome: "-" } },
        { prazos: [{ meses, taxaAm: taxa }], validadeDias: 1, iofAdicionalPct: ad, iofDiarioPct: dia },
        { codigo: "-" },
      ).linhas[0]!;
      mapa.set(l.key, { parcela: r.parcela, cet: r.cetAm });
    }
    return mapa;
  }, [linhas, exemplo, iofAd, iofDia]);

  function aplicarATodos() {
    const t = taxaNum(taxaTodos);
    if (!(t > 0)) {
      toast.error("Informe uma taxa válida, ex.: 2,5");
      return;
    }
    setLinhas((ls) => ls.map((l) => ({ ...l, taxa: decimal(t) })));
  }

  async function salvar() {
    const prazos = linhas
      .filter((l) => l.meses.trim() !== "" || l.taxa.trim() !== "")
      .map((l) => ({ meses: num(l.meses), taxaAm: taxaNum(l.taxa) }));
    const body = {
      prazos,
      validadeDias: num(validade),
      iofAdicionalPct: taxaNum(iofAd),
      iofDiarioPct: taxaNum(iofDia),
      valorMinimo: Number(minimo) || 0,
      valorMaximo: Number(maximo) || 0,
    };
    setSaving(true);
    const res = await fetch("/api/configuracoes/simulacao-condominio", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      data?: SimulacaoCondominioConfig;
    };
    if (!res.ok || !json.data) {
      toast.error("Não deu pra salvar", { description: json.error ?? "Verifique os valores." });
      return;
    }
    // Reflete a versão saneada (ordenada) do servidor.
    setLinhas(
      json.data.prazos.map((p) => ({ key: seq++, meses: String(p.meses), taxa: decimal(p.taxaAm) })),
    );
    toast.success("Simulação de condomínio salva — a próxima simulação já usa as taxas novas.");
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-primary" strokeWidth={1.75} />
            Taxa por prazo (% ao mês)
          </CardTitle>
          <CardDescription>
            Todos os prazos abaixo saem no PDF, cada um com a sua taxa. Use taxas
            diferentes por prazo se quiser (ex.: mais alta no curto, mais baixa no longo).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sc-todos">Mesma taxa para todos</Label>
              <div className="flex gap-2">
                <Input
                  id="sc-todos"
                  className="w-28"
                  inputMode="decimal"
                  placeholder="2,5"
                  value={taxaTodos}
                  onChange={(e) => setTaxaTodos(e.currentTarget.value)}
                />
                <Button type="button" variant="outline" onClick={aplicarATodos}>
                  Aplicar
                </Button>
              </div>
            </div>
            <div className="ml-auto space-y-1.5">
              <Label htmlFor="sc-exemplo">Prévia com crédito de</Label>
              <div className="w-44">
                <InputReais id="sc-exemplo" value={exemplo} onChange={setExemplo} />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Prazo (meses)</th>
                  <th className="px-3 py-2 text-left font-medium">Taxa % a.m.</th>
                  <th className="px-3 py-2 text-right font-medium">Taxa a.a.</th>
                  <th className="px-3 py-2 text-right font-medium">Parcela (prévia)</th>
                  <th className="px-3 py-2 text-right font-medium">CET a.m.</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const p = previa.get(l.key);
                  const taxa = taxaNum(l.taxa);
                  return (
                    <tr key={l.key} className="border-t">
                      <td className="px-3 py-1.5">
                        <Input
                          aria-label="Prazo em meses"
                          className="h-8 w-24"
                          inputMode="numeric"
                          value={l.meses}
                          onChange={(e) => set(l.key, "meses", e.currentTarget.value.replace(/\D/g, ""))}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          aria-label="Taxa ao mês"
                          className="h-8 w-24"
                          inputMode="decimal"
                          value={l.taxa}
                          onChange={(e) => set(l.key, "taxa", e.currentTarget.value)}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {taxa > 0 ? fmtPct(anualiza(taxa)) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                        {p ? fmtBrl(p.parcela) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {p ? fmtPct(p.cet) : "—"}
                      </td>
                      <td className="px-1 py-1.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remover prazo"
                          disabled={linhas.length <= 1}
                          onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={linhas.length >= MAX_PRAZOS}
            onClick={() =>
              setLinhas((ls) => [
                ...ls,
                { key: seq++, meses: "", taxa: ls[ls.length - 1]?.taxa ?? "2,5" },
              ])
            }
          >
            <Plus className="size-4" />
            Adicionar prazo
          </Button>
          <p className="text-xs text-muted-foreground">
            Até {MAX_PRAZOS} prazos, de 1 a 180 meses. Ao salvar, os prazos são
            ordenados do menor pro maior.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parâmetros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="sc-validade">Validade da simulação (dias)</Label>
              <Input id="sc-validade" inputMode="numeric" value={validade} onChange={(e) => setValidade(e.currentTarget.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-min">Valor mínimo simulável</Label>
              <InputReais id="sc-min" value={minimo} onChange={setMinimo} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-max">Valor máximo simulável</Label>
              <InputReais id="sc-max" value={maximo} onChange={setMaximo} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-iof-ad">IOF adicional (% do crédito)</Label>
              <Input id="sc-iof-ad" inputMode="decimal" value={iofAd} onChange={(e) => setIofAd(e.currentTarget.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-iof-dia">IOF diário (% ao dia)</Label>
              <Input id="sc-iof-dia" inputMode="decimal" value={iofDia} onChange={(e) => setIofDia(e.currentTarget.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            IOF padrão de pessoa jurídica: 0,38% + 0,0041% ao dia sobre cada amortização
            (teto de 365 dias), financiado junto com o crédito. Zere os dois campos para
            simular sem IOF — o PDF passa a dizer que as parcelas não incluem IOF.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void salvar()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Salvar simulação
        </Button>
      </div>
    </div>
  );
}
