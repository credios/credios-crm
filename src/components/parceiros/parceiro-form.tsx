"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  PARCEIRO_ORIGEM_LABEL,
  PARCEIRO_ORIGENS,
  PARCEIRO_SEGMENTO_LABEL,
  PARCEIRO_SEGMENTOS,
} from "@/lib/parceiros/constants";

// Cadastro manual de parceiro (indicação, prospecção ativa, evento).
// Admin escolhe atribuição (ou deixa na triagem); consultor cria pra si —
// essa decisão é do servidor, o form só coleta os dados.

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

type ConsultorOption = { id: string; nome: string };

export function ParceiroForm({
  consultores,
  isAdmin,
}: {
  consultores: ConsultorOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    nome: "",
    empresa: "",
    email: "",
    whatsapp: "",
    segmento: "",
    cidade: "",
    estado: "",
    origem: "prospeccao",
    notas: "",
    consultorId: "",
  });

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.nome.trim().length < 2) {
      toast.error("Informe o nome do parceiro.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/parceiros", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: f.nome,
          empresa: f.empresa || null,
          email: f.email || null,
          whatsapp: f.whatsapp || null,
          segmento: f.segmento || null,
          cidade: f.cidade || null,
          estado: f.estado || null,
          origem: f.origem,
          notas: f.notas || null,
          consultorId: isAdmin ? f.consultorId || null : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id: string };
        error?: string;
      };
      if (!res.ok || !json.data) {
        toast.error(json.error ?? "Não consegui salvar. Tente de novo.");
        setBusy(false);
        return;
      }
      toast.success("Parceiro cadastrado.");
      router.push(`/parceiros/${json.data.id}`);
    } catch {
      toast.error("Falha de conexão.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do parceiro</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nome *</Label>
            <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Input value={f.empresa} onChange={(e) => set("empresa", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Segmento</Label>
            <Select value={f.segmento} onValueChange={(v) => set("segmento", v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {PARCEIRO_SEGMENTOS.map((s) => (
                  <SelectItem key={s} value={s}>{PARCEIRO_SEGMENTO_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp</Label>
            <Input
              value={f.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
              placeholder="(00) 00000-0000"
              inputMode="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input
              value={f.email}
              onChange={(e) => set("email", e.target.value)}
              type="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cidade</Label>
            <Input value={f.cidade} onChange={(e) => set("cidade", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>UF</Label>
            <Select value={f.estado} onValueChange={(v) => set("estado", v ?? "")}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                {UFS.map((uf) => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Origem</Label>
            <Select value={f.origem} onValueChange={(v) => set("origem", v ?? "")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PARCEIRO_ORIGENS.map((o) => (
                  <SelectItem key={o} value={o}>{PARCEIRO_ORIGEM_LABEL[o]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={f.consultorId} onValueChange={(v) => set("consultorId", v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Deixar na triagem" />
                </SelectTrigger>
                <SelectContent>
                  {consultores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notas</Label>
            <Textarea
              value={f.notas}
              onChange={(e) => set("notas", e.target.value)}
              rows={3}
              placeholder="Contexto: quem indicou, volume esperado, observações…"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Cadastrar parceiro"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
