"use client";

import { Check, Copy, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PropostaFaixaResult } from "@/lib/simulador/faixa";

import { PropostaFaixaPDF } from "./proposta-faixa-pdf";
import { VoltarProLeadButton } from "./voltar-pro-lead-button";

// Wrapper client da página standalone da PROPOSTA EM FAIXA: renderiza o PDF,
// dispara window.print() uma vez (com título de arquivo amigável) e mostra a
// toolbar de tela (voltar / copiar nº / imprimir). Mesmo padrão do
// SimulacaoRenderer da simulação detalhada.

type Props = {
  result: PropostaFaixaResult;
  leadId: string;
};

export function PropostaRenderer({ result, leadId }: Props) {
  const [copied, setCopied] = useState(false);
  const printedOnce = useRef(false);

  function safeFilename() {
    const safeName = result.clientName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, "_")
      .toUpperCase();
    const kAmount = Math.round(result.creditAmount / 1000) + "K";
    return `Proposta_${result.simulationId}_${safeName}_${kAmount}`;
  }

  function triggerPrint() {
    const originalTitle = document.title;
    document.title = safeFilename();
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 500);
  }

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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
        <VoltarProLeadButton leadId={leadId} />

        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">Nº da proposta:</span>
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

      <PropostaFaixaPDF data={result} />
    </div>
  );
}
