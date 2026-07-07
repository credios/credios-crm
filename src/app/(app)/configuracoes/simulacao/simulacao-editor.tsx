"use client";

import { Loader2, Percent, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import type { SimulacaoFaixaConfig } from "@/lib/simulador/faixa-config";

// Editor das faixas da proposta (admin). Campos numéricos simples + prazos
// como lista separada por vírgula — salvar valida no server (zod) e invalida
// o cache; a próxima proposta gerada já usa os valores novos.

type Props = { initial: SimulacaoFaixaConfig };

export function SimulacaoConfigEditor({ initial }: Props) {
  const [posMin, setPosMin] = useState(String(initial.pos.taxaMinAm));
  const [posMax, setPosMax] = useState(String(initial.pos.taxaMaxAm));
  const [preMin, setPreMin] = useState(String(initial.pre.taxaMinAm));
  const [preMax, setPreMax] = useState(String(initial.pre.taxaMaxAm));
  const [prazos, setPrazos] = useState(initial.prazos.join(", "));
  const [prazoDestaque, setPrazoDestaque] = useState(String(initial.prazoDestaque));
  const [comprometimento, setComprometimento] = useState(
    String(initial.comprometimentoRendaPct),
  );
  const [validade, setValidade] = useState(String(initial.validadeDias));
  const [saving, setSaving] = useState(false);

  const num = (s: string) => Number(s.replace(",", "."));

  async function salvar() {
    const body = {
      pos: { taxaMinAm: num(posMin), taxaMaxAm: num(posMax) },
      pre: { taxaMinAm: num(preMin), taxaMaxAm: num(preMax) },
      prazos: prazos
        .split(/[,;\s]+/)
        .map((p) => Number(p))
        .filter((n) => Number.isFinite(n) && n > 0),
      prazoDestaque: num(prazoDestaque),
      comprometimentoRendaPct: num(comprometimento),
      validadeDias: num(validade),
    };
    setSaving(true);
    const res = await fetch("/api/configuracoes/simulacao", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não deu pra salvar", {
        description: json.error ?? "Verifique os valores.",
      });
      return;
    }
    toast.success("Faixas salvas — próxima proposta já usa os valores novos.");
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="size-4 text-primary" strokeWidth={1.75} />
            Faixas de taxa (% ao mês)
          </CardTitle>
          <CardDescription>
            A proposta mostra parcelas na faixa taxa mínima → máxima. Pós-fixada soma
            IPCA por fora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Pós-fixada (IPCA +) — mínima</Label>
              <Input value={posMin} onChange={(e) => setPosMin(e.currentTarget.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>Pós-fixada (IPCA +) — máxima</Label>
              <Input value={posMax} onChange={(e) => setPosMax(e.currentTarget.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>Pré-fixada — mínima</Label>
              <Input value={preMin} onChange={(e) => setPreMin(e.currentTarget.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>Pré-fixada — máxima</Label>
              <Input value={preMax} onChange={(e) => setPreMax(e.currentTarget.value)} inputMode="decimal" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prazos e parâmetros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Prazos exibidos (meses, separados por vírgula)</Label>
              <Input value={prazos} onChange={(e) => setPrazos(e.currentTarget.value)} placeholder="60, 120, 180, 240" />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo destaque (cenário sugerido)</Label>
              <Input value={prazoDestaque} onChange={(e) => setPrazoDestaque(e.currentTarget.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label>Comprometimento de renda (%)</Label>
              <Input value={comprometimento} onChange={(e) => setComprometimento(e.currentTarget.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label>Validade da proposta (dias)</Label>
              <Input value={validade} onChange={(e) => setValidade(e.currentTarget.value)} inputMode="numeric" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A renda mínima sugerida do PDF = menor parcela do prazo destaque ÷
            comprometimento. IOF segue fixo em 3,38% (convenção de mercado).
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void salvar()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Salvar faixas
        </Button>
      </div>
    </div>
  );
}
