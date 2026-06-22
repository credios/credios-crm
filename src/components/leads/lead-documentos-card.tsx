"use client";

import { useState } from "react";
import { Download, FileText, Link2, Loader2, Mail } from "lucide-react";
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

function fmtSize(b: number | null): string {
  if (!b) return "";
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

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
        if (json.emailSent) {
          toast.success("E-mail enviado ao cliente com o link do portal.");
        } else {
          toast.error(json.emailError ?? "Link gerado, mas o e-mail não saiu.");
        }
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

  const grupos = docs.reduce<Record<string, LeadDoc[]>>((acc, d) => {
    (acc[d.categoria] ??= []).push(d);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-muted-foreground" aria-hidden />
          Documentos
          {docs.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {docs.length}
            </span>
          )}
        </CardTitle>
        {canGerarLink && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => gerar(false)}
              disabled={busy !== null}
            >
              {busy === "link" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Link2 className="size-3.5" />
              )}
              Copiar link
            </Button>
            <Button
              size="sm"
              onClick={() => gerar(true)}
              disabled={busy !== null || !leadTemEmail}
              title={leadTemEmail ? undefined : "Lead sem e-mail cadastrado"}
            >
              {busy === "email" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Mail className="size-3.5" />
              )}
              Enviar por e-mail
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum documento recebido ainda. Gere o link do portal e envie ao
            cliente — ele envia tudo por lá, com segurança.
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grupos).map(([categoria, lista]) => (
              <div key={categoria}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {CAT_LABEL[categoria] ?? categoria}
                </p>
                <ul className="space-y-1.5">
                  {lista.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-lg border border-border-soft bg-card px-3 py-2"
                    >
                      <FileText className="size-4 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {d.rotulo}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {d.filenameOriginal ?? "documento"}
                          {fmtSize(d.tamanhoBytes) && ` · ${fmtSize(d.tamanhoBytes)}`}
                          {d.origem === "consultor" && " · anexado pelo consultor"}
                        </p>
                      </div>
                      <a
                        href={`/api/leads/${leadId}/documentos/${d.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        <Download className="size-3.5" /> Baixar
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
