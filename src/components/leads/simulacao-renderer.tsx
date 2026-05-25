"use client";

import { Check, Copy, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SimpleSimulationResult } from "@/lib/simulador/simple-simulator";

import { SimpleSimulationPDF } from "./simple-simulation-pdf";
import { VoltarProLeadButton } from "./voltar-pro-lead-button";

// ═══════════════════════════════════════════════════════════
// Wrapper client-side da página standalone do PDF.
//
// Recebe o resultado já calculado pelo server e:
//   1. Renderiza o PDF (componente do site).
//   2. Dispara `window.print()` automaticamente uma vez por carregamento.
//   3. Acima do PDF (que só aparece em tela), mostra um header pequeno
//      com o ID da simulação e um botão "Imprimir / Salvar PDF" pra
//      reabrir o diálogo manualmente, e um "Copiar ID".
//
// Por que client component:
//   - `window.print()` precisa rodar no browser.
//   - `document.title` é alterado antes do print pra que o navegador
//     sugira um nome de arquivo bonito (ex: `Simulacao_HE-2026-0148_
//     MARIA_DA_SILVA_500K.pdf`).
// ═══════════════════════════════════════════════════════════

type Props = {
  result: SimpleSimulationResult;
  /** ID do lead — usado pra montar o link de "Voltar pro lead". */
  leadId: string;
};

export function SimulacaoRenderer({ result, leadId }: Props) {
  const [copied, setCopied] = useState(false);
  // Ref pra garantir que o auto-print só dispare 1 vez mesmo com Strict Mode
  // remontando o componente (em dev/test) ou re-renders.
  const printedOnce = useRef(false);

  function safeFilename() {
    const safeName = result.clientName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "_")
      .toUpperCase();
    const kAmount = Math.round(result.creditAmount / 1000) + "K";
    return `Simulacao_${result.simulationId}_${safeName}_${kAmount}`;
  }

  function triggerPrint() {
    const originalTitle = document.title;
    document.title = safeFilename();
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 500);
  }

  // Auto-print ao carregar — atraso pequeno pra fonte do Google e o
  // logo carregarem antes (`@import` no CSS dentro do PDF é assíncrono).
  useEffect(() => {
    if (printedOnce.current) return;
    printedOnce.current = true;
    const t = window.setTimeout(() => triggerPrint(), 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(result.simulationId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Toolbar de tela — escondida na impressão.
          Layout: [Voltar] | [ID + Copiar] | [Imprimir]. O botão Voltar é a
          saída garantida para o consultor que abriu a simulação dentro do
          PWA (onde a setinha do topo só funciona se houver histórico). */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
        {/* Botão "Voltar pro lead" decide a ação por contexto:
            - Aba nova (browser): window.close() — usuário cai na aba
              original que já mostra /leads/[id], evita poluir histórico
              da nova aba (que causava loop com o BackButton do header).
            - PWA / same-window: router.back() — não adiciona entrada.
            - Sem histórico (deep link): router.push("/leads/[id]"). */}
        <VoltarProLeadButton leadId={leadId} />


        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">Nº da simulação:</span>
          <code className="font-mono text-base font-medium text-[#1E4FD6]">
            {result.simulationId}
          </code>
          <button
            type="button"
            onClick={handleCopyId}
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-2 py-1"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copiar
              </>
            )}
          </button>
        </div>

        <Button onClick={triggerPrint} variant="default">
          <Download className="size-4" />
          Imprimir / Salvar PDF
        </Button>
      </div>

      <SimpleSimulationPDF data={result} />
    </div>
  );
}
