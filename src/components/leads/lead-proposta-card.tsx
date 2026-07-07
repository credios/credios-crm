"use client";

import { FileText, Info, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LTV_MAX } from "@/lib/simulador/validator";

// ═══════════════════════════════════════════════════════════
// LeadPropostaCard — proposta em FAIXA com 1 clique.
//
// O consultor não escolhe taxa nem prazo: as faixas vêm da config do
// admin (/configuracoes/simulacao) e o PDF mostra o range de parcelas
// por prazo (Price/SAC). Valores do lead vêm pré-preenchidos — na
// maioria dos casos o fluxo é literalmente 1 clique em "Gerar proposta".
// ═══════════════════════════════════════════════════════════

type Props = {
  leadId: string;
  defaults: {
    valorCreditoCentavos: number | null;
    valorImovelCentavos: number | null;
  };
  /** Labels prontos das faixas vigentes (vêm do server, da config). */
  faixas: { pos: string; pre: string; prazoMax: number };
};

type Indexation = "pre" | "pos";

export function LeadPropostaCard({ leadId, defaults, faixas }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const [creditAmount, setCreditAmount] = useState<number>(
    defaults.valorCreditoCentavos ? Math.round(defaults.valorCreditoCentavos / 100) : 0,
  );
  const [propertyValue, setPropertyValue] = useState<number>(
    defaults.valorImovelCentavos ? Math.round(defaults.valorImovelCentavos / 100) : 0,
  );
  const [indexation, setIndexation] = useState<Indexation>("pos");

  const ltv = useMemo(() => {
    if (propertyValue <= 0) return 0;
    return (creditAmount / propertyValue) * 100;
  }, [creditAmount, propertyValue]);
  const ltvMax = LTV_MAX * 100;
  const ltvExceeded = ltv > ltvMax;

  function isStandalonePwa(): boolean {
    if (typeof window === "undefined") return false;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: minimal-ui)").matches;
    const iosStandalone =
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return Boolean(standalone || iosStandalone);
  }

  async function handleGenerate() {
    if (creditAmount <= 0) {
      toast.error("Informe o valor do crédito");
      return;
    }
    if (propertyValue <= 0) {
      toast.error("Informe o valor do imóvel");
      return;
    }
    if (ltvExceeded) {
      toast.error(
        `LTV (${ltv.toFixed(1)}%) excede o máximo de ${ltvMax}%. Ajuste os valores.`,
      );
      return;
    }

    setPending(true);
    let simulationId: string;
    try {
      const res = await fetch(`/api/leads/${leadId}/proposta`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creditAmount, propertyValue, indexation }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        simulationId?: string;
        error?: string;
      };
      if (!res.ok || !json.simulationId) {
        toast.error("Falha ao gerar proposta", {
          description:
            typeof json.error === "string" ? json.error : "Tente novamente.",
        });
        return;
      }
      simulationId = json.simulationId;
    } catch (err) {
      console.error("[proposta] erro ao registrar:", err);
      toast.error("Erro de rede ao gerar proposta");
      return;
    } finally {
      setPending(false);
    }

    router.refresh();

    const params = new URLSearchParams({
      sid: simulationId,
      credito: String(creditAmount),
      imovel: String(propertyValue),
      idx: indexation,
    });
    const url = `/leads/${leadId}/proposta?${params.toString()}`;
    if (isStandalonePwa()) {
      window.location.href = url;
    } else {
      window.open(url, "_blank");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="size-4 text-primary" strokeWidth={1.75} />
          Gerar proposta
        </CardTitle>
        <CardDescription>
          PDF com faixa de taxas e parcelas por prazo (Price/SAC) — pronto pra
          enviar ao cliente. Valores do lead já preenchidos: é 1 clique.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="prop-credito">Crédito (R$)</Label>
            <Input
              id="prop-credito"
              type="number"
              min={0}
              step={1000}
              value={creditAmount || ""}
              onChange={(e) =>
                setCreditAmount(
                  e.currentTarget.value === "" ? 0 : Number(e.currentTarget.value),
                )
              }
              placeholder="500000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prop-imovel">Imóvel (R$)</Label>
            <Input
              id="prop-imovel"
              type="number"
              min={0}
              step={10000}
              value={propertyValue || ""}
              onChange={(e) =>
                setPropertyValue(
                  e.currentTarget.value === "" ? 0 : Number(e.currentTarget.value),
                )
              }
              placeholder="1000000"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Modalidade</Label>
            <Select
              value={indexation}
              onValueChange={(v) => setIndexation((v ?? "pos") as Indexation)}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v: unknown) =>
                    v === "pre" ? "Pré-fixada" : "Pós (IPCA +)"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pos">Pós-fixada (IPCA +)</SelectItem>
                <SelectItem value="pre">Pré-fixada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Faixa vigente + LTV — contexto do que vai sair no PDF */}
        <div className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
          <Info className="size-3.5 mt-[2px] shrink-0" strokeWidth={1.75} />
          <span>
            Faixa vigente:{" "}
            <strong className="text-foreground">
              {indexation === "pos" ? `${faixas.pos} + IPCA` : faixas.pre}
            </strong>{" "}
            · prazos até {faixas.prazoMax} meses
            {creditAmount > 0 && propertyValue > 0 && (
              <>
                {" "}· LTV{" "}
                <strong className={ltvExceeded ? "text-destructive" : "text-foreground"}>
                  {ltv.toFixed(1)}%
                </strong>
                {ltvExceeded && ` (máx. ${ltvMax}%)`}
              </>
            )}
            <span className="block text-[11px] text-fg-subtle">
              Admin ajusta as faixas em Configurações → Simulação.
            </span>
          </span>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            onClick={handleGenerate}
            disabled={ltvExceeded || pending}
            className="min-w-52"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {pending ? "Gerando…" : "Gerar proposta (PDF)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
