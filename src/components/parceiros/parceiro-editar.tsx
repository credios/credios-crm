"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  PARCEIRO_MOTIVO_PERDA_LABEL,
  PARCEIRO_SEGMENTO_LABEL,
  PARCEIRO_SEGMENTOS,
  type ParceiroSegmento,
} from "@/lib/parceiros/constants";

// Card de dados do parceiro com edição em dialog. CPF/CNPJ importa: é
// pré-requisito do handoff pro portal (Partner.document é obrigatório lá).

type ParceiroDados = {
  id: string;
  nome: string;
  empresa: string | null;
  email: string | null;
  whatsapp: string | null;
  segmento: string | null;
  cidade: string | null;
  estado: string | null;
  cpfCnpj: string | null;
  notas: string | null;
};

function fmtCpfCnpj(v: string | null): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length === 11)
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14)
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v;
}

export function ParceiroEditar({
  parceiro,
  consultorNome,
  motivoPerda,
}: {
  parceiro: ParceiroDados;
  consultorNome: string | null;
  motivoPerda: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    nome: parceiro.nome,
    empresa: parceiro.empresa ?? "",
    email: parceiro.email ?? "",
    whatsapp: parceiro.whatsapp ?? "",
    segmento: parceiro.segmento ?? "",
    cidade: parceiro.cidade ?? "",
    estado: parceiro.estado ?? "",
    cpfCnpj: parceiro.cpfCnpj ?? "",
    notas: parceiro.notas ?? "",
  });

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function salvar() {
    setBusy(true);
    try {
      const res = await fetch(`/api/parceiros/${parceiro.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: f.nome,
          empresa: f.empresa || null,
          email: f.email || null,
          whatsapp: f.whatsapp || null,
          segmento: f.segmento || null,
          cidade: f.cidade || null,
          estado: f.estado || null,
          cpfCnpj: f.cpfCnpj || null,
          notas: f.notas || null,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(json.error ?? "Não consegui salvar.");
        setBusy(false);
        return;
      }
      toast.success("Dados atualizados.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    }
    setBusy(false);
  }

  const linhas: Array<[string, string]> = [
    ["WhatsApp", parceiro.whatsapp ?? "—"],
    ["E-mail", parceiro.email ?? "—"],
    ["CPF/CNPJ", fmtCpfCnpj(parceiro.cpfCnpj)],
    ["Responsável", consultorNome ?? "Triagem (sem dono)"],
  ];
  if (motivoPerda) {
    const [chave, ...resto] = motivoPerda.split(":");
    const label =
      PARCEIRO_MOTIVO_PERDA_LABEL[chave as keyof typeof PARCEIRO_MOTIVO_PERDA_LABEL] ??
      chave;
    linhas.push(["Motivo da perda", [label, resto.join(":").trim()].filter(Boolean).join(" — ")]);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Dados do parceiro</CardTitle>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" /> Editar
        </Button>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {linhas.map(([label, valor]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium">{valor}</dd>
            </div>
          ))}
        </dl>
        {parceiro.notas && (
          <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            {parceiro.notas}
          </p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar parceiro</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome</Label>
              <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Input value={f.empresa} onChange={(e) => set("empresa", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select value={f.segmento} onValueChange={(v) => set("segmento", v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {PARCEIRO_SEGMENTOS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PARCEIRO_SEGMENTO_LABEL[s as ParceiroSegmento]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={f.email} type="email" onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>CPF/CNPJ</Label>
              <Input
                value={f.cpfCnpj}
                onChange={(e) => set("cpfCnpj", e.target.value)}
                placeholder="Necessário pro contrato"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input value={f.cidade} onChange={(e) => set("cidade", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Input
                value={f.estado}
                onChange={(e) => set("estado", e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notas</Label>
              <Textarea value={f.notas} rows={3} onChange={(e) => set("notas", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={busy}>
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
