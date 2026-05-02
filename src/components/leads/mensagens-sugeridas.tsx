"use client";

import { Check, ChevronDown, ChevronRight, Copy, MessageSquare } from "lucide-react";
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
import { renderTemplate, type TemplateLeadVars } from "@/lib/templates";
import { cn } from "@/lib/utils";

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
  /**
   * Se true, expande os 3 primeiros templates por default (status iniciais —
   * novo / conversa_inicial / aguardando_resposta). Caller passa true quando
   * o status do lead pede um playbook ativo na cara do consultor.
   */
  expandirPlaybook?: boolean;
};

export function MensagensSugeridas({
  templates,
  lead,
  expandirPlaybook = false,
}: Props) {
  // Mantém set de templates abertos (preview expandido inline)
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    if (!expandirPlaybook) return new Set();
    // Os 3 primeiros (por ordem) ficam abertos pra ação rápida
    return new Set(
      [...templates]
        .sort((a, b) => a.ordem - b.ordem)
        .slice(0, 3)
        .map((t) => t.id),
    );
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (templates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Playbook de mensagens
          </CardTitle>
          <CardDescription>
            Nenhum template configurado para este status. Admin pode editar em
            Configurações → Mensagens.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyTemplate(t: Template) {
    const rendered = renderTemplate(t.conteudo, lead);
    try {
      await navigator.clipboard.writeText(rendered);
      setCopiedId(t.id);
      toast.success(`"${t.nome}" copiado`);
      setTimeout(() => setCopiedId((c) => (c === t.id ? null : c)), 2000);
    } catch {
      toast.error("Não foi possível copiar — selecione o texto manualmente.");
    }
  }

  const sorted = [...templates].sort((a, b) => a.ordem - b.ordem);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="size-4 text-primary" strokeWidth={1.75} />
          Playbook de mensagens
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            {sorted.length}{" "}
            {sorted.length === 1 ? "mensagem" : "mensagens"}
          </span>
        </CardTitle>
        <CardDescription>
          {expandirPlaybook
            ? "Sequência sugerida pra os primeiros contatos. Variáveis substituídas com os dados do lead."
            : "Templates aplicáveis ao status atual. Clique em uma pra expandir e copiar."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((t, idx) => {
          const isOpen = openIds.has(t.id);
          const isCopied = copiedId === t.id;
          const rendered = renderTemplate(t.conteudo, lead);
          return (
            <div
              key={t.id}
              className={cn(
                "rounded-lg border bg-card transition-shadow",
                isOpen && "shadow-elev-sm",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-foreground/3 transition-colors rounded-lg"
              >
                <span className="font-mono text-[11px] font-semibold text-fg-subtle tabular-nums w-5">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-sm font-medium truncate">
                  {t.nome.replace(/^\d+\.\s*/, "")}
                </span>
                {isOpen ? (
                  <ChevronDown
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                ) : (
                  <ChevronRight
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                )}
              </button>

              {isOpen && (
                <div className="space-y-2.5 px-3 pb-3 pt-1">
                  <pre className="whitespace-pre-wrap rounded-md bg-bg-muted/70 p-3 text-[13px] font-sans leading-relaxed text-foreground">
                    {rendered}
                  </pre>
                  <div className="flex items-center justify-end">
                    <Button
                      size="sm"
                      variant={isCopied ? "secondary" : "default"}
                      onClick={() => copyTemplate(t)}
                      className={cn(
                        isCopied &&
                          "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
                      )}
                    >
                      {isCopied ? (
                        <>
                          <Check className="size-3.5" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" /> Copiar mensagem
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
