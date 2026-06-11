"use client";

import { Landmark, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BANCOS_PARCEIROS,
  STATUS_PROPOSTA_BANCO_LABEL,
} from "@/lib/constants";
import { formatRelative } from "@/lib/formatters/date";

export type LeadBancoRow = {
  id: string;
  banco: string;
  status: string;
  enviadoEm: Date | string;
  atualizadoEm: Date | string;
  observacoes: string | null;
};

const STATUS_OPTIONS = Object.entries(STATUS_PROPOSTA_BANCO_LABEL);

// Valor sentinela do select — nunca persiste: o nome digitado é o que vai pra API.
const OUTRO_VALUE = "__outro__";

export function LeadBancosCard({
  leadId,
  rows,
  canEdit,
}: {
  leadId: string;
  rows: LeadBancoRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [banco, setBanco] = useState("");
  const [bancoOutro, setBancoOutro] = useState("");
  const [status, setStatus] = useState("enviado");
  const [observacoes, setObservacoes] = useState("");
  const [pending, setPending] = useState(false);

  const isOutro = banco === OUTRO_VALUE;
  const bancoFinal = isOutro
    ? bancoOutro.trim().replace(/\s+/g, " ").slice(0, 80)
    : banco;

  async function addBanco() {
    if (!bancoFinal) {
      toast.error(
        isOutro ? "Informe o nome do banco ou fundo" : "Selecione um banco",
      );
      return;
    }
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}/bancos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        banco: bancoFinal,
        status,
        observacoes: observacoes.trim() || null,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não foi possível salvar banco", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    toast.success("Banco atualizado");
    setBanco("");
    setBancoOutro("");
    setStatus("enviado");
    setObservacoes("");
    startTransition(() => router.refresh());
  }

  async function updateStatus(row: LeadBancoRow, novoStatus: string) {
    const res = await fetch(`/api/leads/${leadId}/bancos/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: novoStatus, observacoes: row.observacoes }),
    });
    if (!res.ok) {
      toast.error("Não foi possível atualizar status do banco");
      return;
    }
    toast.success("Status do banco atualizado");
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="size-4" /> Bancos e propostas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/15 px-4 py-6 text-center space-y-1.5">
            <p className="font-display text-sm font-semibold">
              Sem bancos parceiros vinculados
            </p>
            <p className="font-serif italic text-xs text-muted-foreground">
              Quando o lead avançar pra documentação enviada ou negociação,
              registre aqui qual banco recebeu a proposta.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{row.banco}</p>
                  <p className="text-xs text-muted-foreground">
                    enviado {formatRelative(row.enviadoEm)} · atualizado{" "}
                    {formatRelative(row.atualizadoEm)}
                  </p>
                  {row.observacoes && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {row.observacoes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {STATUS_PROPOSTA_BANCO_LABEL[row.status] ?? row.status}
                  </Badge>
                  {canEdit && (
                    <Select
                      value={row.status}
                      onValueChange={(v) => v && updateStatus(row, v)}
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="space-y-3 rounded-md border bg-muted/25 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Banco</Label>
                <Select value={banco} onValueChange={(v) => setBanco(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANCOS_PARCEIROS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                    <SelectItem value={OUTRO_VALUE}>
                      Outro (banco ou fundo não listado)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isOutro && (
                <div className="space-y-1.5">
                  <Label htmlFor="banco-outro-nome">Nome do banco/fundo</Label>
                  <Input
                    id="banco-outro-nome"
                    value={bancoOutro}
                    maxLength={80}
                    placeholder="Ex.: Fundo XPTO Capital"
                    onChange={(e) => setBancoOutro(e.currentTarget.value)}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v ?? "enviado")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.currentTarget.value)}
                placeholder="Pendências, retorno do banco, condição recebida..."
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={addBanco} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Adicionar/atualizar banco
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
