"use client";

import { Calculator, ExternalLink, Info } from "lucide-react";
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
import { maskCpf } from "@/lib/formatters/cpf-cnpj";
import { LTV_MAX } from "@/lib/simulador/validator";

// ═══════════════════════════════════════════════════════════
// LeadSimulacaoCard — formulário inline no detalhe do lead.
//
// Pré-preenche nome/CPF/valor do imóvel/valor do crédito a partir do
// próprio lead. O consultor preenche taxa, prazo, tipo de tabela e
// indexação, clica "Gerar PDF" e abre uma nova aba (`/leads/[id]/
// simulacao?...`) que renderiza o PDF formatado e dispara `window.print()`
// automaticamente.
//
// Por que client component:
//   - Form com state local (sem precisar server roundtrip pra cada keystroke).
//   - `window.open` precisa rodar no browser.
//
// Por que NÃO usa server action diretamente:
//   - O cálculo acontece na nova aba (na página standalone do PDF) pra
//     manter a página de detalhe leve. Aqui só validamos minimamente
//     (LTV, valores positivos) antes de abrir a aba.
// ═══════════════════════════════════════════════════════════

type Props = {
  leadId: string;
  /** Dados pré-preenchidos vindos do lead. Tudo opcional — consultor
   *  edita à vontade no card. */
  defaults: {
    nome: string;
    cpf: string | null;
    valorCreditoCentavos: number | null;
    valorImovelCentavos: number | null;
  };
};

type AmortizationType = "price" | "sac";
type Indexation = "pre" | "pos";

export function LeadSimulacaoCard({ leadId, defaults }: Props) {
  // Pré-preenchimento dos valores em REAIS (não centavos — o simulador
  // trabalha em reais). Se o lead não tem valor, fica vazio e o consultor
  // preenche manualmente.
  const defaultCredito = defaults.valorCreditoCentavos
    ? Math.round(defaults.valorCreditoCentavos / 100)
    : 0;
  const defaultImovel = defaults.valorImovelCentavos
    ? Math.round(defaults.valorImovelCentavos / 100)
    : 0;

  const [clientName, setClientName] = useState(defaults.nome);
  const [clientCPF, setClientCPF] = useState(
    defaults.cpf ? maskCpf(defaults.cpf) : "",
  );
  const [creditAmount, setCreditAmount] = useState<number>(defaultCredito);
  const [propertyValue, setPropertyValue] = useState<number>(defaultImovel);
  const [interestRate, setInterestRate] = useState<string>("1.19"); // % a.m.
  const [installments, setInstallments] = useState<number>(180);
  const [amortizationType, setAmortizationType] =
    useState<AmortizationType>("price");
  const [indexation, setIndexation] = useState<Indexation>("pos");

  // LTV em tempo real, idêntico ao do simulador do site.
  const ltv = useMemo(() => {
    if (propertyValue <= 0) return 0;
    return (creditAmount / propertyValue) * 100;
  }, [creditAmount, propertyValue]);
  const ltvMax = LTV_MAX * 100;
  const ltvExceeded = ltv > ltvMax;

  function buildUrl(): string {
    const params = new URLSearchParams({
      nome: clientName,
      cpf: clientCPF,
      credito: String(creditAmount),
      imovel: String(propertyValue),
      taxa: interestRate,
      prazo: String(installments),
      tipo: amortizationType,
      idx: indexation,
    });
    return `/leads/${leadId}/simulacao?${params.toString()}`;
  }

  /**
   * Decide o modo de abertura do PDF a partir do contexto do navegador:
   *
   *   - Browser comum: abre em nova aba (`_blank`). O consultor mantém o
   *     lead aberto numa aba e a simulação noutra, alterna como quiser.
   *
   *   - PWA / aplicativo instalado (Chrome → "Instalar app", Safari "Add to
   *     Home Screen", Edge PWA): a janela não tem barra de abas, então
   *     `window.open(_blank)` dispara uma janela ÓRFÃ sem botão de voltar
   *     ativo (histórico vazio). Solução: navegar na MESMA janela. O botão
   *     de voltar do topo do PWA fica ativo (porque agora tem histórico) e
   *     o consultor consegue voltar pro lead com 1 clique.
   *
   * Também suportamos `display-mode: minimal-ui` (Chrome iOS quando o app
   * é "fixado" na tela de início).
   */
  function isStandalonePwa(): boolean {
    if (typeof window === "undefined") return false;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: minimal-ui)").matches;
    // iOS Safari home-screen — exposto em `navigator.standalone` (não-padrão).
    const iosStandalone =
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return Boolean(standalone || iosStandalone);
  }

  function handleGenerate() {
    // Validação de UX antes de abrir a aba — o servidor revalida tudo,
    // mas dá pra dar feedback instantâneo aqui sem ida-e-volta.
    if (clientName.trim().length < 3) {
      toast.error("Nome do cliente é obrigatório (mínimo 3 caracteres)");
      return;
    }
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
        `LTV (${ltv.toFixed(1)}%) excede o máximo permitido de ${ltvMax}%. Ajuste o crédito ou o valor do imóvel.`,
      );
      return;
    }
    const taxaNum = Number(interestRate.replace(",", "."));
    if (!(taxaNum > 0)) {
      toast.error("Informe a taxa de juros (% ao mês)");
      return;
    }
    if (!(installments > 0)) {
      toast.error("Informe o prazo em meses");
      return;
    }

    const url = buildUrl();
    if (isStandalonePwa()) {
      // Mesmo window — o botão "Voltar pro lead" da própria página da
      // simulação (e a setinha do PWA, agora com histórico) traz de volta.
      window.location.href = url;
    } else {
      // Aba nova — usuário mantém o lead aberto na aba original.
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  // Pequeno helper de exibição do valor — labels mostram o que está
  // sendo enviado em centavos→reais pra o consultor saber se o lead
  // tinha esse dado preenchido.
  const fonteCredito = defaultCredito > 0 ? "do lead" : "vazio — preencha";
  const fonteImovel = defaultImovel > 0 ? "do lead" : "vazio — preencha";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="size-4 text-primary" strokeWidth={1.75} />
          Gerar simulação
        </CardTitle>
        <CardDescription>
          Os valores do lead vêm pré-preenchidos. Edite se o cliente pedir
          uma simulação diferente. Ao clicar em &ldquo;Gerar PDF&rdquo; abre
          uma nova aba pronta pra imprimir/salvar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Dados do cliente ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sim-nome">Nome do cliente</Label>
            <Input
              id="sim-nome"
              value={clientName}
              onChange={(e) => setClientName(e.currentTarget.value)}
              placeholder="Nome completo"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-cpf">CPF (opcional)</Label>
            <Input
              id="sim-cpf"
              value={clientCPF}
              onChange={(e) => setClientCPF(maskCpf(e.currentTarget.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
          </div>
        </div>

        {/* ── Valores ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sim-credito">
              Valor do crédito (R$){" "}
              <span className="text-[11px] font-normal text-muted-foreground">
                · {fonteCredito}
              </span>
            </Label>
            <Input
              id="sim-credito"
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
            <Label htmlFor="sim-imovel">
              Valor do imóvel (R$){" "}
              <span className="text-[11px] font-normal text-muted-foreground">
                · {fonteImovel}
              </span>
            </Label>
            <Input
              id="sim-imovel"
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
        </div>

        {/* ── LTV em tempo real ── */}
        {creditAmount > 0 && propertyValue > 0 && (
          <div
            className={
              ltvExceeded
                ? "flex items-start gap-2 text-[12.5px] text-destructive"
                : "flex items-start gap-2 text-[12.5px] text-muted-foreground"
            }
          >
            <Info className="size-3.5 mt-[2px] shrink-0" strokeWidth={1.75} />
            <span>
              LTV: <strong>{ltv.toFixed(1)}%</strong> (máximo {ltvMax}%)
              {ltvExceeded
                ? " — acima do limite, ajuste os valores antes de gerar."
                : ""}
            </span>
          </div>
        )}

        {/* ── Parâmetros da operação ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sim-taxa">Taxa (% a.m.)</Label>
            <Input
              id="sim-taxa"
              type="number"
              min={0}
              step="0.01"
              value={interestRate}
              onChange={(e) => setInterestRate(e.currentTarget.value)}
              placeholder="1.19"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-prazo">Prazo (meses)</Label>
            <Input
              id="sim-prazo"
              type="number"
              min={1}
              step="1"
              value={installments || ""}
              onChange={(e) =>
                setInstallments(
                  e.currentTarget.value === "" ? 0 : Number(e.currentTarget.value),
                )
              }
              placeholder="180"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de tabela</Label>
            <Select
              value={amortizationType}
              onValueChange={(v) =>
                setAmortizationType((v ?? "price") as AmortizationType)
              }
            >
              <SelectTrigger>
                <SelectValue>
                  {(v: unknown) =>
                    v === "sac" ? "SAC (decrescente)" : "PRICE (fixa)"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price">PRICE (parcela fixa)</SelectItem>
                <SelectItem value="sac">SAC (parcelas decrescentes)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5 sm:col-span-1">
            <Label>Indexação</Label>
            <Select
              value={indexation}
              onValueChange={(v) => setIndexation((v ?? "pos") as Indexation)}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v: unknown) =>
                    v === "pre" ? "Pré-fixado" : "Pós-fixado (IPCA +)"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pre">Pré-fixado</SelectItem>
                <SelectItem value="pos">Pós-fixado (IPCA +)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="flex justify-end pt-1">
          <Button onClick={handleGenerate} disabled={ltvExceeded}>
            <ExternalLink className="size-4" />
            Gerar PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
