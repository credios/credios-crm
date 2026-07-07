"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/leads/status-badge";
import { Button } from "@/components/ui/button";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { formatRelative } from "@/lib/formatters/date";
import type { LeadRow } from "@/lib/leads/list-leads";
import { cn } from "@/lib/utils";

const TABS: { key: string; label: string; statuses: string[] | null }[] = [
  { key: "todos", label: "Todos", statuses: null },
  { key: "novos", label: "Novos", statuses: ["novo"] },
  { key: "em_funil", label: "Em Funil", statuses: ["conversa_inicial", "aguardando_resposta", "reuniao_agendada"] },
  { key: "qualificados", label: "Qualificados", statuses: ["aguardando_documentacao", "documentacao_enviada", "aguardando_cadastro"] },
  { key: "em_negociacao", label: "Em Negociação", statuses: ["em_negociacao"] },
  { key: "aguardando_doc", label: "Aguardando Doc", statuses: ["aguardando_documentacao"] },
  { key: "documentacao_enviada", label: "Documentação Enviada", statuses: ["documentacao_enviada"] },
  { key: "fechados", label: "Fechados", statuses: ["fechado"] },
  { key: "perdidos", label: "Perdidos", statuses: ["perdido"] },
  { key: "desqualificados", label: "Desqualificados", statuses: ["desqualificado"] },
];

type Props = {
  leads: LeadRow[];
};

export function GoogleAdsClient({ leads }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const activeTab = params.get("tab") ?? "todos";
  const tabDef = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  const filtered = useMemo(() => {
    if (!tabDef.statuses) return leads;
    const set = new Set(tabDef.statuses);
    return leads.filter((l) => set.has(l.status));
  }, [leads, tabDef]);

  function setTab(key: string) {
    const next = new URLSearchParams(params.toString());
    if (key === "todos") next.delete("tab");
    else next.set("tab", key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function handleExport() {
    if (filtered.length === 0) {
      toast.error("Nada pra exportar");
      return;
    }
    const csv = rowsToCsv(
      filtered as unknown as Array<
        LeadRow & {
          utmCampaign?: string | null;
          palavraChave?: string | null;
          gclid?: string | null;
          rede?: string | null;
        }
      >,
      [
        { header: "id", get: (l) => l.id },
        { header: "nome", get: (l) => l.nome },
        { header: "status", get: (l) => l.status },
        {
          header: "valor_buscado",
          get: (l) =>
            l.valorCreditoCentavos != null ? (l.valorCreditoCentavos / 100).toFixed(2) : "",
        },
        { header: "campanha", get: (l) => l.utmCampaign ?? "" },
        { header: "palavra_chave", get: (l) => l.palavraChave ?? "" },
        { header: "gclid", get: (l) => l.gclid ?? "" },
        { header: "midia_rede", get: (l) => l.rede ?? "" },
        { header: "consultor", get: (l) => l.consultorNome ?? "" },
        { header: "criado_em", get: (l) => new Date(l.createdAt).toISOString() },
        {
          header: "ultimo_contato",
          get: (l) => (l.ultimoContato ? new Date(l.ultimoContato).toISOString() : ""),
        },
      ],
    );
    downloadCsv(
      `google-ads-${tabDef.key}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    );
    toast.success(`${filtered.length} leads exportados`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filtered.length} leads · {tabDef.label}
        </p>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="size-4" /> Exportar CSV
        </Button>
      </div>

      <div className="overflow-x-auto border-b">
        <nav className="flex gap-1 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 py-1.5 text-sm border-b-2 -mb-[1px] whitespace-nowrap",
                activeTab === t.key
                  ? "border-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <Th>Nome</Th>
                <Th>Status</Th>
                <Th>Valor buscado</Th>
                <Th>Campanha</Th>
                <Th>Palavra-chave</Th>
                <Th>GCLID</Th>
                <Th>Mídia</Th>
                <Th>Criado em</Th>
                <Th>Último contato</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                    Nenhum lead nesta aba.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => {
                  const lx = l as unknown as LeadRow & {
                    utmCampaign?: string | null;
                    palavraChave?: string | null;
                    gclid?: string | null;
                    rede?: string | null;
                  };
                  return (
                    <tr key={l.id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/leads/${l.id}`}
                          prefetch={false}
                          className="hover:underline"
                        >
                          {l.nome}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="px-3 py-2">
                        {formatBrlFromCents(l.valorCreditoCentavos)}
                      </td>
                      <td className="px-3 py-2 text-xs">{lx.utmCampaign ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{lx.palavraChave ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {lx.gclid ? (
                          <code className="text-[10px] truncate inline-block max-w-[120px] align-middle">
                            {lx.gclid}
                          </code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{lx.rede ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{formatRelative(l.createdAt)}</td>
                      <td className="px-3 py-2 text-xs">
                        {l.ultimoContato ? formatRelative(l.ultimoContato) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </th>
  );
}
