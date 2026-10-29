"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { PortalIcon, type PortalIconName } from "./portal-icons";
import {
  chavesObrigatorias,
  type DocItem,
  type DocSection,
} from "@/lib/portal/checklist";

export type UploadedDoc = { id: string; filename: string; tamanhoBytes: number };
export type DocsPorTipo = Record<string, UploadedDoc[]>;

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,image/*,application/pdf";

function fmtSize(b: number): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const INPUT_DARK =
  "w-full h-11 rounded-xl border border-white/15 bg-white/[0.04] px-3.5 text-[14px] text-white placeholder:text-white/30 transition-colors focus:border-credios-blue/60 focus:outline-none focus:ring-2 focus:ring-credios-blue/20";
const OCUPACOES_CONJUGE = ["CLT", "Autônomo", "Empresário", "Servidor Público", "Aposentado", "Outro"];

function formatBrlInput(v: string): string {
  const n = parseInt(v.replace(/\D/g, ""), 10) || 0;
  return n === 0 ? "" : "R$ " + n.toLocaleString("pt-BR");
}

/** Pergunta opcional, no portal, se o cônjuge compõe renda — quando o cliente
 *  pulou a última etapa do simulador. Ao confirmar, recarrega (a checklist
 *  recalcula no servidor com os docs de renda do cônjuge, se for o caso). */
function ConjugeRendaAsk({ token }: { token: string }) {
  const [compoe, setCompoe] = useState<boolean | null>(null);
  const [renda, setRenda] = useState("");
  const [ocupacao, setOcupacao] = useState("");
  const [busy, setBusy] = useState(false);

  const podeEnviar =
    compoe === false || (compoe === true && renda.trim() !== "" && ocupacao !== "");

  async function submit() {
    if (compoe === null || !podeEnviar) return;
    setBusy(true);
    try {
      const rendaNum = Number(renda.replace(/\D/g, "")) || 0;
      const res = await fetch(`/api/portal/${token}/conjuge-renda`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          compoe,
          renda: compoe ? rendaNum : undefined,
          ocupacao: compoe ? ocupacao : undefined,
        }),
      });
      if (!res.ok) {
        toast.error("Não consegui salvar agora. Tente de novo.");
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      toast.error("Falha de conexão. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-credios-gold/25 bg-credios-gold/[0.05] p-5 backdrop-blur-xl sm:p-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-credios-gold/15 ring-1 ring-credios-gold/25">
          <PortalIcon name="conjuge" className="h-5 w-5 text-credios-gold" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-white">
            Seu cônjuge vai compor renda?
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug text-white/55">
            Se o seu cônjuge também tem renda, ela pode somar à sua e aumentar o valor aprovado.
            Você decide — é opcional.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {(
          [
            [true, "Sim, vai compor"],
            [false, "Não"],
          ] as const
        ).map(([val, label]) => (
          <button
            key={String(val)}
            type="button"
            onClick={() => setCompoe(val)}
            className={`cursor-pointer rounded-2xl border p-3 text-sm font-semibold transition-colors ${
              compoe === val
                ? "border-credios-gold/60 bg-credios-gold/10 text-credios-gold"
                : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {compoe === true && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-white/70">
              Renda mensal do cônjuge
            </label>
            <input
              inputMode="numeric"
              value={renda}
              onChange={(e) => setRenda(formatBrlInput(e.target.value))}
              placeholder="R$ 8.000"
              className={INPUT_DARK}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-white/70">
              Ocupação do cônjuge
            </label>
            <select
              value={ocupacao}
              onChange={(e) => setOcupacao(e.target.value)}
              className={`${INPUT_DARK} cursor-pointer`}
            >
              <option value="" className="bg-[#0d1d40]">Selecione…</option>
              {OCUPACOES_CONJUGE.map((o) => (
                <option key={o} value={o} className="bg-[#0d1d40]">{o}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {compoe !== null && (
        <button
          type="button"
          disabled={!podeEnviar || busy}
          onClick={submit}
          className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-credios-blue to-blue-600 px-5 py-3 text-sm font-semibold text-white transition-[filter] duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
            </>
          ) : (
            "Confirmar"
          )}
        </button>
      )}
    </section>
  );
}

export function PortalClient({
  token,
  firstName,
  sections,
  initialDocs,
  perguntarConjugeRenda,
}: {
  token: string;
  firstName: string;
  sections: DocSection[];
  initialDocs: DocsPorTipo;
  perguntarConjugeRenda?: boolean;
}) {
  const [docs, setDocs] = useState<DocsPorTipo>(initialDocs);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [concluido, setConcluido] = useState(false);

  const obrigatorias = useMemo(() => chavesObrigatorias(sections), [sections]);
  const enviadosObrig = obrigatorias.filter((k) => (docs[k]?.length ?? 0) > 0).length;
  const totalObrig = obrigatorias.length;
  const pct = totalObrig === 0 ? 0 : Math.round((enviadosObrig / totalObrig) * 100);

  async function uploadFiles(item: DocItem, files: FileList | null) {
    if (!files || files.length === 0) return;
    const atuais = docs[item.key]?.length ?? 0;
    const limite = item.maxArquivos ?? (item.multiplos ? 20 : 1);
    const lista = Array.from(files).slice(0, Math.max(0, limite - atuais));
    if (lista.length === 0) {
      toast.info(`Você já enviou o máximo de arquivos para "${item.rotulo}".`);
      return;
    }

    setBusy((b) => ({ ...b, [item.key]: true }));
    for (const file of lista) {
      const form = new FormData();
      form.set("file", file);
      form.set("tipo", item.key);
      form.set("categoria", item.categoria);
      form.set("rotulo", item.rotulo);
      try {
        const res = await fetch(`/api/portal/${token}/upload`, {
          method: "POST",
          body: form,
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          documento?: { id: string; filename: string; tamanhoBytes: number };
        };
        if (!res.ok || !json.ok || !json.documento) {
          toast.error(json.error ?? "Não consegui enviar esse arquivo. Tente de novo.");
          continue;
        }
        const novo = json.documento;
        setDocs((d) => ({ ...d, [item.key]: [...(d[item.key] ?? []), novo] }));
      } catch {
        toast.error("Falha de conexão ao enviar. Tente novamente.");
      }
    }
    setBusy((b) => ({ ...b, [item.key]: false }));
  }

  async function removeDoc(itemKey: string, docId: string) {
    try {
      const res = await fetch(`/api/portal/${token}/upload?docId=${docId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Não consegui remover agora. Tente de novo.");
        return;
      }
      setDocs((d) => ({
        ...d,
        [itemKey]: (d[itemKey] ?? []).filter((x) => x.id !== docId),
      }));
    } catch {
      toast.error("Falha de conexão. Tente novamente.");
    }
  }

  return (
    <div className="relative mx-auto max-w-2xl px-4 pb-24 pt-7 sm:px-6">
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <Image
          src="/credios-logo.png"
          alt="Credios"
          width={94}
          height={30}
          priority
          className="h-[26px] w-auto object-contain brightness-0 invert"
        />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/65 backdrop-blur">
          <Lock className="h-3 w-3 text-emerald-400" aria-hidden /> Ambiente seguro
        </span>
      </header>

      {/* Hero */}
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] p-7 shadow-[0_8px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-credios-gold/25 bg-credios-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-credios-gold">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-credios-gold" aria-hidden /> Sua proposta já está em andamento
        </div>
        <h1 className="font-display text-[26px] font-bold leading-tight text-white sm:text-3xl">
          {firstName}, vamos adiantar a sua proposta
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">
          Reunimos aqui, num só lugar e com segurança, a lista exata de documentos do
          seu caso. Quanto antes recebermos, mais rápido buscamos as melhores condições
          com os bancos parceiros — e um consultor da Credios já entra em contato pra te
          acompanhar.
        </p>

        {/* Progresso */}
        {totalObrig > 0 && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-white/70">
                {enviadosObrig} de {totalObrig} essenciais enviados
              </span>
              <span className="text-white/40">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-credios-blue to-credios-gold transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Tranquilização — pode enviar aos poucos */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {(
          [
            { icon: "enviar", t: "Envie aos poucos", d: "Mandou o que tinha? Pode fechar e voltar — salvamos tudo." },
            { icon: "seguranca", t: "Seus dados protegidos", d: "Usados só para a análise da sua proposta (LGPD)." },
            { icon: "personalizado", t: "Só o que o seu caso pede", d: "Lista personalizada pra você, sem papelada à toa." },
          ] as { icon: PortalIconName; t: string; d: string }[]
        ).map((b) => (
          <div
            key={b.t}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur"
          >
            <PortalIcon name={b.icon} className="mb-2 h-5 w-5 text-credios-blue" />
            <p className="text-[13px] font-semibold text-white/85">{b.t}</p>
            <p className="mt-1 text-[12px] leading-snug text-white/50">{b.d}</p>
          </div>
        ))}
      </div>

      {/* Pergunta de composição de renda do cônjuge (quando pulou o simulador) */}
      {perguntarConjugeRenda && (
        <div className="mt-5">
          <ConjugeRendaAsk token={token} />
        </div>
      )}

      {/* Seções */}
      <div className="mt-6 space-y-5">
        {sections.map((section) => {
          return (
            <section
              key={section.categoria + section.titulo}
              className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_6px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:p-6"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-credios-blue/15 ring-1 ring-credios-blue/25">
                  <PortalIcon name={section.categoria} className="h-5 w-5 text-credios-blue" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold text-white">
                    {section.titulo}
                  </h2>
                  {section.descricao && (
                    <p className="mt-0.5 text-[13px] leading-snug text-white/50">
                      {section.descricao}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {section.items.map((item) => (
                  <DocRow
                    key={item.key}
                    item={item}
                    enviados={docs[item.key] ?? []}
                    busy={Boolean(busy[item.key])}
                    onUpload={(files) => uploadFiles(item, files)}
                    onRemove={(docId) => removeDoc(item.key, docId)}
                  />
                ))}
              </div>

              {section.nota && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-[12.5px] leading-snug text-white/55">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                  {section.nota}
                </p>
              )}
            </section>
          );
        })}
      </div>

      {/* Conclusão / tranquilização final */}
      <div className="mt-7">
        {concluido ? (
          <div className="rounded-[24px] border border-emerald-400/25 bg-emerald-400/[0.07] p-6 text-center backdrop-blur-xl">
            <CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-400" aria-hidden />
            <h3 className="font-display text-lg font-semibold text-white">
              Recebemos, {firstName}!
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/60">
              Sua proposta segue em andamento e um consultor da Credios entra em contato
              em breve para te acompanhar. Precisa enviar algum documento depois? É só
              voltar por este mesmo link, no seu tempo.
            </p>
            <button
              type="button"
              onClick={() => setConcluido(false)}
              className="mt-4 cursor-pointer text-sm font-medium text-credios-gold underline-offset-4 transition-colors hover:text-credios-gold/80 hover:underline"
            >
              Continuar enviando
            </button>
          </div>
        ) : (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 text-center backdrop-blur-xl">
            <p className="mx-auto max-w-md text-sm leading-relaxed text-white/60">
              Não precisa de tudo agora. Envie o que tiver em mãos — a gente cuida do
              resto com você.
            </p>
            <button
              type="button"
              onClick={() => setConcluido(true)}
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-credios-blue to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-credios-blue/25 transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.99]"
            >
              Já enviei o que tenho por agora
            </button>
          </div>
        )}
      </div>

      <footer className="mt-8 text-center text-[11px] leading-relaxed text-white/30">
        Seus documentos são armazenados com segurança e usados exclusivamente para a
        análise da sua proposta de crédito (LGPD).
        <br />
        Credios · Crédito com Garantia de Imóvel
      </footer>
    </div>
  );
}

function DocRow({
  item,
  enviados,
  busy,
  onUpload,
  onRemove,
}: {
  item: DocItem;
  enviados: UploadedDoc[];
  busy: boolean;
  onUpload: (files: FileList | null) => void;
  onRemove: (docId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const temAlgum = enviados.length > 0;
  const cheio =
    item.maxArquivos != null
      ? enviados.length >= item.maxArquivos
      : !item.multiplos && temAlgum;

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        temAlgum
          ? "border-emerald-400/20 bg-emerald-400/[0.04]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-semibold text-white/90">{item.rotulo}</span>
            {item.obrigatorio ? (
              <span className="rounded-full border border-credios-gold/30 bg-credios-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-credios-gold">
                Obrigatório
              </span>
            ) : (
              <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                Opcional
              </span>
            )}
            {item.multiplos && (
              <span className="rounded-full border border-credios-blue/30 bg-credios-blue/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-credios-blue/90">
                Vários arquivos
              </span>
            )}
            {temAlgum && (
              <Check className="h-4 w-4 text-emerald-400" aria-hidden />
            )}
          </div>
          <p className="mt-1 text-[12.5px] leading-snug text-white/50">{item.descricao}</p>
        </div>
      </div>

      {/* Arquivos enviados */}
      {temAlgum && (
        <ul className="mt-3 space-y-1.5">
          {enviados.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-credios-blue" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">
                {d.filename}
              </span>
              {d.tamanhoBytes > 0 && (
                <span className="shrink-0 text-[11px] text-white/35">
                  {fmtSize(d.tamanhoBytes)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(d.id)}
                className="shrink-0 cursor-pointer rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
                aria-label="Remover documento"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Botão de envio */}
      {!cheio && (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-2.5 text-[13px] font-medium text-white/70 transition-colors hover:border-credios-blue/60 hover:bg-credios-blue/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Enviando…
            </>
          ) : (
            <>
              <UploadCloud className="h-4 w-4" aria-hidden />
              {temAlgum ? "Enviar outro arquivo" : "Tocar para enviar"}
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple={Boolean(item.multiplos)}
        className="hidden"
        onChange={(e) => {
          onUpload(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
