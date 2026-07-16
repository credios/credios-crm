"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  PARCEIRO_INTERACAO_TIPOS,
  PARCEIRO_INTERACAO_LABEL,
  PARCEIRO_MOTIVO_PERDA_LABEL,
  PARCEIRO_MOTIVOS_PERDA,
  PARCEIRO_STATUS,
  PARCEIRO_STATUS_LABEL,
  type ParceiroStatus,
} from "@/lib/parceiros/constants";

// Ações do detalhe do parceiro: mudar status (modal de motivo quando perdido),
// atribuir (admin/gerente) e registrar contato. Todas via PATCH/POST + refresh.

type ConsultorOption = { id: string; nome: string };

async function patchParceiro(id: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(`/api/parceiros/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return json.error ?? "Não consegui salvar.";
  } catch {
    return "Falha de conexão.";
  }
}

export function ParceiroStatusSelect({
  parceiroId,
  status,
}: {
  parceiroId: string;
  status: ParceiroStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [perdidoOpen, setPerdidoOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");

  async function mudar(novo: string, extra?: Record<string, unknown>) {
    setBusy(true);
    const err = await patchParceiro(parceiroId, { status: novo, ...extra });
    setBusy(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(`Status: ${PARCEIRO_STATUS_LABEL[novo as ParceiroStatus]}`);
    setPerdidoOpen(false);
    router.refresh();
  }

  return (
    <>
      <Select
        value={status}
        disabled={busy}
        onValueChange={(v) => {
          if (!v || v === status) return;
          if (v === "perdido") {
            setPerdidoOpen(true);
            return;
          }
          void mudar(v);
        }}
      >
        <SelectTrigger className="w-[190px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PARCEIRO_STATUS.map((s) => (
            <SelectItem key={s} value={s}>
              {PARCEIRO_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={perdidoOpen} onOpenChange={setPerdidoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como perdido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Motivo *</Label>
              <Select value={motivo} onValueChange={(v) => setMotivo(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {PARCEIRO_MOTIVOS_PERDA.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PARCEIRO_MOTIVO_PERDA_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Detalhe (opcional)</Label>
              <Textarea value={detalhe} onChange={(e) => setDetalhe(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerdidoOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!motivo || busy}
              onClick={() =>
                void mudar("perdido", { motivoPerda: motivo, motivoPerdaDetalhe: detalhe || null })
              }
            >
              Confirmar perda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ParceiroAtribuir({
  parceiroId,
  consultorId,
  consultores,
}: {
  parceiroId: string;
  consultorId: string | null;
  consultores: ConsultorOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function atribuir(v: string) {
    setBusy(true);
    const err = await patchParceiro(parceiroId, {
      consultorId: v === "__pool__" ? null : v,
    });
    setBusy(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success("Atribuição atualizada.");
    router.refresh();
  }

  return (
    <Select value={consultorId ?? "__pool__"} disabled={busy} onValueChange={(v) => v && void atribuir(v)}>
      <SelectTrigger className="w-[190px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__pool__">Triagem (sem dono)</SelectItem>
        {consultores.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ParceiroRegistrarContato({ parceiroId }: { parceiroId: string }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>("whatsapp");
  const [conteudo, setConteudo] = useState("");
  const [busy, setBusy] = useState(false);

  async function registrar() {
    setBusy(true);
    try {
      const res = await fetch(`/api/parceiros/${parceiroId}/interacoes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo, conteudo: conteudo || null }),
      });
      if (!res.ok) {
        toast.error("Não consegui registrar.");
        setBusy(false);
        return;
      }
      setConteudo("");
      toast.success("Contato registrado.");
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <Select value={tipo} onValueChange={(v) => setTipo(v ?? "whatsapp")}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PARCEIRO_INTERACAO_TIPOS.map((t) => (
              <SelectItem key={t} value={t}>
                {PARCEIRO_INTERACAO_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => void registrar()} disabled={busy} size="sm" className="ml-auto">
          Registrar
        </Button>
      </div>
      <Textarea
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        rows={2}
        placeholder="Resumo do contato (opcional)"
      />
    </div>
  );
}
