"use client";

import { Copy, Eye } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { renderTemplate, type TemplateLeadVars } from "@/lib/templates";

export type Template = {
  id: string;
  nome: string;
  ordem: number;
  conteudo: string;
  statusAplicavel: string[] | null;
};

type Props = {
  templates: Template[];
  lead: TemplateLeadVars;
};

export function MensagensSugeridas({ templates, lead }: Props) {
  const [previewing, setPreviewing] = useState<Template | null>(null);

  if (templates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagens sugeridas</CardTitle>
          <CardDescription>
            Nenhum template configurado para este status. Admin pode editar em
            Configurações → Mensagens.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function copyTemplate(t: Template) {
    const rendered = renderTemplate(t.conteudo, lead);
    try {
      await navigator.clipboard.writeText(rendered);
      toast.success(`"${t.nome}" copiado`);
    } catch {
      toast.error("Não foi possível copiar — abra o preview pra copiar manual.");
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagens sugeridas</CardTitle>
          <CardDescription>
            Templates aplicáveis ao status atual. Variáveis no padrão{" "}
            <code className="text-xs">{"{{nome}}"}</code>,{" "}
            <code className="text-xs">{"{{primeiro_nome}}"}</code>,{" "}
            <code className="text-xs">{"{{valor_credito}}"}</code> etc são
            substituídas ao copiar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-md border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{t.nome}</p>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPreviewing(t)}
                    aria-label="Preview"
                  >
                    <Eye className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => copyTemplate(t)}
                    aria-label="Copiar"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{t.conteudo}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={previewing !== null} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{previewing?.nome}</DialogTitle>
            <DialogDescription>
              Variáveis substituídas com os dados do lead.
            </DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm font-sans">
            {previewing ? renderTemplate(previewing.conteudo, lead) : ""}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewing(null)}>
              Fechar
            </Button>
            <Button
              onClick={() => {
                if (previewing) {
                  void copyTemplate(previewing);
                  setPreviewing(null);
                }
              }}
            >
              <Copy className="size-4" /> Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
