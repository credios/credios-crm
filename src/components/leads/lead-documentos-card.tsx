"use client";

import { useState } from "react";
import { Archive, Download, FileText, Link2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type LeadDoc = {
  id: string;
  tipo: string;
  categoria: string;
  rotulo: string;
  filenameOriginal: string | null;
  tamanhoBytes: number | null;
  origem: string;
  createdAt: string;
};

const CAT_LABEL: Record<string, string> = {
  titular: "Do titular",
  renda: "Renda",
  estado_civil: "Estado civil",
  conjuge: "Cônjuge",
  imovel: "Imóvel",
};

type TipoGroup = {
  tipo: string;
  categoria: string;
  rotulo: string;
  count: number;
  origem: string;
};

export function LeadDocumentosCard({
  leadId,
  docs,
  canGerarLink,
  leadTemEmail,
}: {
  leadId: string;
  docs: LeadDoc[];
  canGerarLink: boolean;
  leadTemEmail: boolean;
}) {
  const [busy, setBusy] = useState<"link" | "email" | null>(null);

  async function gerar(enviarEmail: boolean) {
    setBusy(enviarEmail ? "email" : "link");
    try {
      const res = await fetch(`/api/leads/${leadId}/portal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enviarEmail }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        emailSent?: boolean;
        emailError?: string;
        error?: string;
      };
      if (!res.ok || !json.url) {
        toast.error(json.error ?? "Não foi possível gerar o link.");
        return;
      }
      if (enviarEmail) {
        if (json.emailSent) toast.success("E-mail enviado ao cliente com o link do portal.");
        else toast.error(json.emailError ?? "Link gerado, mas o e-mail não saiu.");
      } else {
        await navigator.clipboard.writeText(json.url).catch(() => {});
        toast.success("Link do portal copiado para a área de transferência.");
      }
    } catch {
      toast.error("Falha de conexão. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  // Agrupa por TIPO (um tipo pode ter vários arquivos), preservando categorias.
  const tiposMap = new Map<string, TipoGroup>();
  for (const d of docs) {
    const e = tiposMap.get(d.tipo);
    if (e) e.count++;
    else
      tiposMap.set(d.tipo, {
        tipo: d.tipo,
        categoria: d.categoria,
        rotulo: d.rotulo,
        count: 1,
        origem: d.origem,
      });
  }
  const tipos = [...tiposMap.values()];
  const porCategoria = tipos.reduce<Record<string, TipoGroup[]>>((acc, t) => {
    (acc[t.categoria] ??= []).push(t);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-muted-foreground" aria-hidden />
          Documentos
          {tipos.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {tipos.length}
            </span>
          )}
        </CardTitle>
        {canGerarLink && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => gerar(false)} disabled={busy !== null}>
              {busy === "link" ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
              Copiar link
            </Button>
            <Button
              size="sm"
              onClick={() => gerar(true)}
              disabled={busy !== null || !leadTemEmail}
              title={leadTemEmail ? undefined : "Lead sem e-mail cadastrado"}
            >
              {busy === "email" ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
              Enviar por e-mail
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {tipos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum documento recebido ainda. Gere o link do portal e envie ao cliente —
            ele envia tudo por lá, com segurança.
          </p>
        ) : (
          <div className="space-y-4">
            <a
              href={`/api/leads/${leadId}/documentos-zip`}
              className="inline-flex items-center gap-2 rounded-md border border-border-soft bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Archive className="size-4 text-primary" /> Baixar tudo (.zip)
            </a>

            {Object.entries(porCategoria).map(([categoria, grupos]) => (
              <div key={categoria}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {CAT_LABEL[categoria] ?? categoria}
                </p>
                <ul className="space-y-1.5">
                  {grupos.map((g) => (
                    <li
                      key={g.tipo}
                      className="flex items-center gap-3 rounded-lg border border-border-soft bg-card px-3 py-2"
                    >
                      <FileText className="size-4 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{g.rotulo}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {g.count} {g.count === 1 ? "arquivo" : "arquivos"}
                          {g.origem === "consultor" && " · anexado pelo consultor"}
                        </p>
                      </div>
                      <a
                        href={`/api/leads/${leadId}/documentos-pdf?tipo=${encodeURIComponent(g.tipo)}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        <Download className="size-3.5" /> Baixar PDF
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
