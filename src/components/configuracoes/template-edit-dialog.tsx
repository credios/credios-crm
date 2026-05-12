"use client";

import { Eye, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { renderTemplate, SAMPLE_LEAD } from "@/lib/templates";

const STATUS_VALUES = Object.keys(STATUS_LEAD_LABEL);

export type TemplateRow = {
  id: string;
  nome: string;
  ordem: number;
  conteudo: string;
  statusAplicavel: string[] | null;
  ativa: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: TemplateRow | null; // null = create
  onSaved: () => void;
};

export function TemplateEditDialog({ open, onOpenChange, template, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {open && (
          <TemplateForm
            key={template?.id ?? "new"}
            template={template}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onSaved();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({
  template,
  onCancel,
  onSaved,
}: {
  template: TemplateRow | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(template?.nome ?? "");
  const [conteudo, setConteudo] = useState(template?.conteudo ?? "");
  const [statusAplicavel, setStatusAplicavel] = useState<string[]>(
    template?.statusAplicavel ?? ["novo"],
  );
  const [ativa, setAtiva] = useState(template?.ativa ?? true);
  const [showPreview, setShowPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStatus(s: string, checked: boolean) {
    setStatusAplicavel((prev) => {
      if (checked) return Array.from(new Set([...prev, s]));
      return prev.filter((x) => x !== s);
    });
  }

  async function onSubmit() {
    setError(null);
    if (nome.trim().length < 2) {
      setError("Nome muito curto");
      return;
    }
    if (conteudo.trim().length < 5) {
      setError("Conteúdo muito curto");
      return;
    }
    if (statusAplicavel.length === 0) {
      setError("Selecione pelo menos 1 status aplicável");
      return;
    }

    setPending(true);
    const payload = {
      nome: nome.trim(),
      conteudo: conteudo.trim(),
      statusAplicavel,
      ativa,
    };
    const url = template
      ? `/api/configuracoes/mensagens/${template.id}`
      : "/api/configuracoes/mensagens";
    const method = template ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const msg =
        typeof json.error === "string" ? json.error : `Falha (${res.status})`;
      setError(msg);
      toast.error("Erro ao salvar", { description: msg });
      return;
    }
    toast.success(template ? "Template atualizado" : "Template criado");
    onSaved();
  }

  const preview = renderTemplate(conteudo, SAMPLE_LEAD);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{template ? "Editar template" : "Novo template"}</DialogTitle>
        <DialogDescription>
          Variáveis suportadas:{" "}
          <code className="text-xs">{"{{saudacao}}"}</code> (Bom dia / Boa tarde / Boa noite conforme horário),{" "}
          <code className="text-xs">{"{{nome}}"}</code>,{" "}
          <code className="text-xs">{"{{primeiro_nome}}"}</code>,{" "}
          <code className="text-xs">{"{{valor_credito}}"}</code>,{" "}
          <code className="text-xs">{"{{valor_imovel}}"}</code>,{" "}
          <code className="text-xs">{"{{cidade}}"}</code>,{" "}
          <code className="text-xs">{"{{estado}}"}</code>.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="t-nome">Nome do template</Label>
            <Input
              id="t-nome"
              value={nome}
              onChange={(e) => setNome(e.currentTarget.value)}
              placeholder="Ex: Boas-vindas, Follow-up sem resposta…"
              disabled={pending}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={ativa} onCheckedChange={setAtiva} disabled={pending} />
            <Label className="cursor-pointer">{ativa ? "Ativa" : "Desativada"}</Label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Status aplicáveis</Label>
          <div className="grid gap-x-4 gap-y-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 rounded-md border bg-muted/30 p-3">
            {STATUS_VALUES.map((s) => (
              <label
                key={s}
                className="flex items-start gap-2 text-sm cursor-pointer leading-snug"
              >
                <Checkbox
                  checked={statusAplicavel.includes(s)}
                  onCheckedChange={(v) => toggleStatus(s, v === true)}
                  disabled={pending}
                  className="mt-0.5 shrink-0"
                />
                <span>{STATUS_LEAD_LABEL[s]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="t-conteudo">Conteúdo</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview((v) => !v)}
              disabled={pending}
            >
              <Eye className="size-3.5" />
              {showPreview ? "Esconder preview" : "Visualizar com lead exemplo"}
            </Button>
          </div>
          <Textarea
            id="t-conteudo"
            rows={6}
            value={conteudo}
            onChange={(e) => setConteudo(e.currentTarget.value)}
            placeholder="{{saudacao}}, {{primeiro_nome}}! …"
            disabled={pending}
          />
          {showPreview && (
            <div className="rounded-md border bg-card p-3 text-sm">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Preview com lead exemplo (Maria Silva, R$ 350k)
              </p>
              <pre className="whitespace-pre-wrap font-sans">{preview}</pre>
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={onSubmit} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {template ? "Salvar alterações" : "Criar template"}
        </Button>
      </DialogFooter>
    </>
  );
}
