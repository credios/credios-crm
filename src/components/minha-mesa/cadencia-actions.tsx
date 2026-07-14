"use client";

import {
  Check,
  Clock,
  FileSearch,
  Loader2,
  MessageSquare,
  Phone,
  PhoneMissed,
  Reply,
  SkipForward,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhoneBr } from "@/lib/formatters/phone";
import type { FilaAcao } from "@/lib/minha-mesa/queries";

// Ações de 1 toque dos cards de cadência / desfecho de reunião. Filosofia:
// o botão primário FAZ tudo (prepara mensagem, registra, avança, abre o
// WhatsApp) — o consultor só executa. Travar, nunca: pular/adiar sempre à mão.

type Props = {
  leadId: string;
  whatsapp: string | null;
  acao: FilaAcao;
  onResolved: () => void;
};

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, json };
}

export function CadenciaActions({ leadId, whatsapp, acao, onResolved }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [manterAberto, setManterAberto] = useState(false);
  const [nota, setNota] = useState("");

  async function agir(body: unknown, sucesso: string, chave: string) {
    setPending(chave);
    const { ok, json } = await post(`/api/leads/${leadId}/cadencia`, body);
    setPending(null);
    if (!ok) {
      toast.error("Não deu certo", {
        description: typeof json.error === "string" ? json.error : "Tente de novo.",
      });
      return false;
    }
    toast.success(sucesso);
    onResolved();
    return json;
  }

  /* ── Desfecho de reunião ── */
  if (acao.tipo === "desfecho_reuniao") {
    const desfecho = async (resultado: "realizada" | "no_show") => {
      setPending(resultado);
      const { ok, json } = await post(`/api/reunioes/${acao.reuniaoId}/desfecho`, { resultado });
      setPending(null);
      if (!ok) {
        toast.error("Não deu certo", {
          description: typeof json.error === "string" ? json.error : "Tente de novo.",
        });
        return;
      }
      toast.success(
        resultado === "realizada"
          ? "Boa! Próximo passo: documentação — o pedido já entrou na sua fila."
          : "Registrado. O resgate (reconvite + ligação) já entrou na sua fila.",
      );
      onResolved();
    };
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button size="sm" onClick={() => void desfecho("realizada")} disabled={!!pending}
          className="bg-emerald-600 hover:bg-emerald-600/90 text-white">
          {pending === "realizada" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Realizada
        </Button>
        <Button size="sm" variant="outline" onClick={() => void desfecho("no_show")} disabled={!!pending}>
          {pending === "no_show" ? <Loader2 className="size-3.5 animate-spin" /> : <PhoneMissed className="size-3.5" />}
          Não aconteceu
        </Button>
      </div>
    );
  }

  /* ── REVISAR DOCUMENTOS do portal: abre o lead + marca revisado ── */
  if (acao.tipo === "revisar_docs") {
    const revisei = async () => {
      setPending("revisei");
      const { ok, json } = await post(`/api/leads/${leadId}/interacoes`, {
        tipo: "anotacao",
        conteudo: `Documentos do portal revisados (${acao.quantidade} novo${acao.quantidade > 1 ? "s" : ""}).`,
      });
      setPending(null);
      if (!ok) {
        toast.error("Não deu certo", {
          description: typeof json.error === "string" ? json.error : "Tente de novo.",
        });
        return;
      }
      toast.success("Revisão registrada.");
      onResolved();
    };
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
          onClick={() => window.open(`/leads/${leadId}`, "_blank", "noopener,noreferrer")}
        >
          <FileSearch className="size-3.5" />
          Abrir documentos
        </Button>
        <Button size="sm" variant="outline" onClick={() => void revisei()} disabled={!!pending}>
          {pending === "revisei" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Revisei — dei retorno
        </Button>
      </div>
    );
  }

  /* ── CONTATO DIRETO (fora da cadência): registra e abre o canal ── */
  if (acao.tipo === "contato_direto") {
    const fone = (whatsapp ?? "").replace(/\D/g, "");
    const registrar = async (
      tipo: "whatsapp_enviado" | "ligacao",
      conteudo: string | null,
      sucesso: string,
      chave: string,
      metadata?: Record<string, unknown>,
    ) => {
      setPending(chave);
      const { ok, json } = await post(`/api/leads/${leadId}/interacoes`, {
        tipo,
        ...(conteudo ? { conteudo } : {}),
        ...(metadata ? { metadata } : {}),
      });
      setPending(null);
      if (!ok) {
        toast.error("Não deu certo", {
          description: typeof json.error === "string" ? json.error : "Tente de novo.",
        });
        return false;
      }
      toast.success(sucesso);
      onResolved();
      return true;
    };
    const abrirWhats = async () => {
      // Timeline compacta: registra O QUE foi feito, não a transcrição.
      // O texto completo vai no metadata pra auditoria.
      const ok = await registrar(
        "whatsapp_enviado",
        "Mensagem pré-pronta enviada pelo WhatsApp (Mesa).",
        "Contato registrado — só apertar enviar no WhatsApp 🚀",
        "whats",
        acao.mensagem ? { mensagem: acao.mensagem, mesa: true } : { mesa: true },
      );
      if (ok && fone) {
        const url = acao.mensagem
          ? `https://wa.me/${fone}?text=${encodeURIComponent(acao.mensagem)}`
          : `https://wa.me/${fone}`;
        window.open(url, "_blank", "noopener,noreferrer");
      }
    };

    if (acao.canal === "ligacao") {
      return (
        <div className="space-y-2">
          {fone && (
            <a
              href={`tel:+${fone}`}
              className="inline-flex items-center gap-2 font-mono text-base font-semibold tabular-nums text-foreground hover:text-primary"
            >
              <Phone className="size-4 text-emerald-600" />
              {formatPhoneBr(whatsapp)}
            </a>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button size="sm" disabled={!!pending}
              onClick={() => void registrar("ligacao", "Atendeu", "Boa ligação! Contato registrado.", "atendeu")}
              className="bg-emerald-600 hover:bg-emerald-600/90 text-white">
              {pending === "atendeu" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Liguei — atendeu
            </Button>
            <Button size="sm" variant="outline" disabled={!!pending}
              onClick={() => void registrar("ligacao", "Não atendeu", "Registrado.", "nao_atendeu")}>
              {pending === "nao_atendeu" ? <Loader2 className="size-3.5 animate-spin" /> : <PhoneMissed className="size-3.5" />}
              Não atendeu
            </Button>
            {fone && (
              <Button size="sm" variant="ghost" disabled={!!pending} onClick={() => void abrirWhats()}>
                {pending === "whats" ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />}
                WhatsApp
              </Button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button size="sm" onClick={() => void abrirWhats()} disabled={!!pending || !fone}
          className="bg-emerald-600 hover:bg-emerald-600/90 text-white">
          {pending === "whats" ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />}
          Abrir WhatsApp com a mensagem pronta
        </Button>
        <Button size="sm" variant="ghost" disabled={!!pending}
          onClick={() => void registrar("ligacao", null, "Ligação registrada.", "liguei")}>
          {pending === "liguei" ? <Loader2 className="size-3.5 animate-spin" /> : <Phone className="size-3.5" />}
          Liguei
        </Button>
      </div>
    );
  }

  /* ── Passo de MENSAGEM: abre WhatsApp com a mensagem pronta ── */
  if (acao.tipo === "mensagem") {
    const executar = async () => {
      const r = await agir(
        { acao: "executar_mensagem" },
        "Mensagem registrada — só apertar enviar no WhatsApp 🚀",
        "mensagem",
      );
      if (r && typeof r.waUrl === "string") {
        window.open(r.waUrl, "_blank", "noopener,noreferrer");
      }
    };
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button size="sm" onClick={() => void executar()} disabled={!!pending}
          className="bg-emerald-600 hover:bg-emerald-600/90 text-white">
          {pending === "mensagem" ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />}
          Abrir WhatsApp com a mensagem pronta
        </Button>
        <BotoesSecundarios agir={agir} pending={pending} />
      </div>
    );
  }

  /* ── Passo de LIGAÇÃO: número + desfecho em 1 toque ── */
  if (acao.tipo === "ligacao") {
    const fone = (whatsapp ?? "").replace(/\D/g, "");
    return (
      <div className="space-y-2">
        {fone && (
          <a
            href={`tel:+${fone}`}
            className="inline-flex items-center gap-2 font-mono text-base font-semibold tabular-nums text-foreground hover:text-primary"
          >
            <Phone className="size-4 text-emerald-600" />
            {formatPhoneBr(whatsapp)}
          </a>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" onClick={() => void agir({ acao: "executar_ligacao", resultado: "atendeu" }, "Boa ligação! Cadência segue.", "atendeu")}
            disabled={!!pending} className="bg-emerald-600 hover:bg-emerald-600/90 text-white">
            {pending === "atendeu" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Liguei — atendeu
          </Button>
          <Button size="sm" variant="outline" disabled={!!pending}
            onClick={async () => {
              const temMsg = "temMensagem" in acao && acao.temMensagem;
              const r = await agir(
                { acao: "executar_ligacao", resultado: "nao_atendeu", enviarMensagem: temMsg },
                temMsg ? "Registrado — mensagem de backup pronta no WhatsApp 🚀" : "Registrado — próximo passo já agendado.",
                "nao_atendeu",
              );
              if (r && typeof (r as Record<string, unknown>).waUrl === "string") {
                window.open((r as { waUrl: string }).waUrl, "_blank", "noopener,noreferrer");
              }
            }}>
            {pending === "nao_atendeu" ? <Loader2 className="size-3.5 animate-spin" /> : <PhoneMissed className="size-3.5" />}
            {"temMensagem" in acao && acao.temMensagem ? "Não atendeu — mandar mensagem" : "Não atendeu"}
          </Button>
          <BotoesSecundarios agir={agir} pending={pending} semRespondeu />
        </div>
      </div>
    );
  }

  /* ── DECISÃO de fim de cadência ── */
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button size="sm" variant="destructive" disabled={!!pending}
          onClick={() => void agir({ acao: "decisao_perdido" }, "Lead encerrado — pipeline limpo. 🎯", "perdido")}>
          {pending === "perdido" ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          Perdido — sem resposta
        </Button>
        <Button size="sm" variant="outline" disabled={!!pending} onClick={() => setManterAberto((v) => !v)}>
          <Clock className="size-3.5" />
          Manter +7d
        </Button>
      </div>
      {manterAberto && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nota.trim()) return;
            void agir({ acao: "decisao_manter", nota: nota.trim() }, "Mantido por +7 dias.", "manter");
          }}
        >
          <Input
            autoFocus
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Por que vale insistir? (1 linha)"
            className="h-8 text-sm"
            maxLength={140}
          />
          <Button size="sm" type="submit" disabled={!nota.trim() || !!pending}>
            {pending === "manter" ? <Loader2 className="size-3.5 animate-spin" /> : "Ok"}
          </Button>
        </form>
      )}
    </div>
  );
}

function BotoesSecundarios({
  agir,
  pending,
  semRespondeu,
}: {
  agir: (body: unknown, sucesso: string, chave: string) => Promise<unknown>;
  pending: string | null;
  semRespondeu?: boolean;
}) {
  return (
    <>
      {!semRespondeu && (
        <Button size="sm" variant="ghost" disabled={!!pending}
          onClick={() => void agir({ acao: "respondeu" }, "Boa — conversa viva! Lembrete empurrado.", "respondeu")}
          title="O cliente respondeu no seu WhatsApp">
          {pending === "respondeu" ? <Loader2 className="size-3.5 animate-spin" /> : <Reply className="size-3.5" />}
          Respondeu
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={!!pending}
        onClick={() => void agir({ acao: "adiar" }, "Adiado pra amanhã.", "adiar")}>
        {pending === "adiar" ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
        Adiar 1d
      </Button>
      <Button size="sm" variant="ghost" disabled={!!pending}
        onClick={() => void agir({ acao: "pular" }, "Passo pulado.", "pular")}>
        {pending === "pular" ? <Loader2 className="size-3.5 animate-spin" /> : <SkipForward className="size-3.5" />}
        Pular
      </Button>
    </>
  );
}
