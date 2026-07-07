"use client";

import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Editor das cadências (Admin). Um card por estágio; linhas de passo editáveis
// (título, dias após o anterior, tipo, template, energia). Regras duras
// validadas no server: último passo = decisão; mensagem exige template.

type Passo = {
  titulo: string;
  deltaDias: number;
  tipo: "mensagem" | "ligacao" | "decisao";
  templateId: string | null;
  energia: string | null;
};

type Cadencia = {
  id: string;
  statusKey: string;
  passos: Passo[];
  ativa: boolean;
};

type TemplateOpt = { id: string; nome: string };

const STATUS_LABEL: Record<string, string> = {
  aguardando_resposta: "Aguardando resposta",
  conversa_inicial: "Conversa inicial",
  aguardando_documentacao: "Aguardando documentação",
};

export function CadenciasEditor() {
  const [cadencias, setCadencias] = useState<Cadencia[] | null>(null);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/configuracoes/cadencias")
      .then((r) => r.json())
      .then((json: { cadencias?: Cadencia[]; templates?: TemplateOpt[] }) => {
        setCadencias(json.cadencias ?? []);
        setTemplates(json.templates ?? []);
      })
      .catch(() => toast.error("Não consegui carregar as cadências"));
  }, []);

  if (!cadencias) {
    return (
      <div className="surface-solid rounded-xl p-8 text-center">
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function mudar(statusKey: string, fn: (c: Cadencia) => Cadencia) {
    setCadencias((prev) => prev!.map((c) => (c.statusKey === statusKey ? fn(c) : c)));
  }

  async function salvar(c: Cadencia) {
    setSalvando(c.statusKey);
    const res = await fetch("/api/configuracoes/cadencias", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statusKey: c.statusKey, passos: c.passos, ativa: c.ativa }),
    });
    setSalvando(null);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não salvou", { description: json.error ?? `Falha ${res.status}` });
      return;
    }
    toast.success(`Cadência de "${STATUS_LABEL[c.statusKey] ?? c.statusKey}" salva — já valendo.`);
  }

  return (
    <div className="space-y-4">
      {cadencias.map((c) => {
        // Dia acumulado (D+N) pra leitura fácil.
        let acumulado = 0;
        return (
          <Card key={c.statusKey}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  {STATUS_LABEL[c.statusKey] ?? c.statusKey}
                </CardTitle>
                <Badge variant={c.ativa ? "soft" : "outline"}>
                  {c.ativa ? "ativa" : "desligada"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={c.ativa}
                    onChange={(e) => mudar(c.statusKey, (x) => ({ ...x, ativa: e.target.checked }))}
                  />
                  Ativa
                </label>
                <Button size="sm" onClick={() => void salvar(c)} disabled={salvando === c.statusKey}>
                  {salvando === c.statusKey ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Salvar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {c.passos.map((p, i) => {
                acumulado += p.deltaDias;
                const dia = acumulado;
                return (
                  <div
                    key={i}
                    className="grid grid-cols-2 items-center gap-2 rounded-lg border p-2 md:grid-cols-[2rem_1fr_6.5rem_7.5rem_1fr_1fr_2rem]"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {i + 1}
                      <span className="ml-1 text-[10px]">(D+{dia})</span>
                    </span>
                    <Input
                      value={p.titulo}
                      onChange={(e) =>
                        mudar(c.statusKey, (x) => atualizaPasso(x, i, { titulo: e.target.value }))
                      }
                      className="h-8 text-sm"
                      placeholder="Título do passo"
                    />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      +
                      <Input
                        type="number"
                        min={0}
                        max={60}
                        value={p.deltaDias}
                        onChange={(e) =>
                          mudar(c.statusKey, (x) =>
                            atualizaPasso(x, i, { deltaDias: Math.max(0, Number(e.target.value) || 0) }),
                          )
                        }
                        className="h-8 w-14 text-sm"
                      />
                      d
                    </label>
                    <select
                      value={p.tipo}
                      onChange={(e) =>
                        mudar(c.statusKey, (x) =>
                          atualizaPasso(x, i, { tipo: e.target.value as Passo["tipo"] }),
                        )
                      }
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="mensagem">💬 Mensagem</option>
                      <option value="ligacao">📞 Ligação</option>
                      <option value="decisao">⚖️ Decisão</option>
                    </select>
                    <select
                      value={p.templateId ?? ""}
                      disabled={p.tipo !== "mensagem"}
                      onChange={(e) =>
                        mudar(c.statusKey, (x) =>
                          atualizaPasso(x, i, { templateId: e.target.value || null }),
                        )
                      }
                      className="h-8 rounded-md border bg-background px-2 text-sm disabled:opacity-40"
                    >
                      <option value="">— template —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={p.energia ?? ""}
                      onChange={(e) =>
                        mudar(c.statusKey, (x) =>
                          atualizaPasso(x, i, { energia: e.target.value || null }),
                        )
                      }
                      className="h-8 text-sm"
                      placeholder="Frase de energia (opcional)"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() =>
                        mudar(c.statusKey, (x) => ({
                          ...x,
                          passos: x.passos.filter((_, j) => j !== i),
                        }))
                      }
                      disabled={c.passos.length <= 1}
                      title="Remover passo"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  mudar(c.statusKey, (x) => ({
                    ...x,
                    passos: [
                      ...x.passos.slice(0, -1),
                      {
                        titulo: "Novo passo",
                        deltaDias: 2,
                        tipo: "mensagem" as const,
                        templateId: null,
                        energia: null,
                      },
                      x.passos[x.passos.length - 1]!,
                    ],
                  }))
                }
              >
                <Plus className="size-3.5" />
                Adicionar passo (antes da decisão)
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function atualizaPasso(c: Cadencia, i: number, patch: Partial<Passo>): Cadencia {
  return { ...c, passos: c.passos.map((p, j) => (j === i ? { ...p, ...patch } : p)) };
}
