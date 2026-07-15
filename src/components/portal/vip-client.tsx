"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";

import { DocRow, type DocsPorTipo } from "./portal-client";
import { VipEstadoCivil, VipValores } from "./vip-complementos";
import { PortalIcon } from "./portal-icons";
import { chavesObrigatorias, type DocItem, type DocSection } from "@/lib/portal/checklist";
import { buildChecklistVip, type EstadoCivilVip } from "@/lib/portal/checklist-vip";

// Portal VIP — atendimento personalizado de alto valor. Copy MÍNIMA e
// IMPESSOAL: o cliente já falou com o consultor; a página não vende nada e
// não se apresenta. Só recebe. A checklist é recalculada no client conforme o
// estado civil confirmado (certidão certa pra situação certa). Reusa DocRow do
// portal padrão (mesmo upload, mesma tabela).

type Props = {
  token: string;
  firstName: string;
  initialEstadoCivil: EstadoCivilVip | null;
  initialDocs: DocsPorTipo;
  valores: { valorImovel: string; valorCredito: string };
  conjuge: { nome: string; email: string; whatsapp: string };
};


/** Uma seção de documentos (título + linhas de upload). Module-level: componente
 *  declarado dentro do render reseta estado a cada re-render. */
function Secao({
  section,
  docs,
  busy,
  onUpload,
  onRemove,
}: {
  section: DocSection;
  docs: DocsPorTipo;
  busy: Record<string, boolean>;
  onUpload: (item: DocItem, files: FileList | null) => void;
  onRemove: (itemKey: string, docId: string) => void;
}) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_6px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:p-6">
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
            onUpload={(files) => onUpload(item, files)}
            onRemove={(docId) => onRemove(item.key, docId)}
          />
        ))}
      </div>
    </section>
  );
}

export function VipClient({
  token,
  firstName,
  initialEstadoCivil,
  initialDocs,
  valores,
  conjuge,
}: Props) {
  const [docs, setDocs] = useState<DocsPorTipo>(initialDocs);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [estadoCivil, setEstadoCivil] = useState<EstadoCivilVip | null>(
    initialEstadoCivil,
  );

  const sections = useMemo(() => buildChecklistVip(estadoCivil), [estadoCivil]);
  const obrigatorias = useMemo(() => chavesObrigatorias(sections), [sections]);
  const enviados = obrigatorias.filter((k) => (docs[k]?.length ?? 0) > 0).length;
  const total = obrigatorias.length;
  const pct = total === 0 ? 0 : Math.round((enviados / total) * 100);
  const completo = total > 0 && enviados === total && estadoCivil != null;

  // Identificação abre a página; o bloco de estado civil (pergunta + dados do
  // cônjuge) entra logo abaixo dela; o resto (certidão, IRPF, imóvel) segue.
  const secIdentificacao = sections.find((s) => s.categoria === "titular");
  const secRestantes = sections.filter((s) => s.categoria !== "titular");

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
        const res = await fetch(`/api/portal/${token}/upload`, { method: "POST", body: form });
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
      const res = await fetch(`/api/portal/${token}/upload?docId=${docId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Não consegui remover agora. Tente de novo.");
        return;
      }
      setDocs((d) => ({ ...d, [itemKey]: (d[itemKey] ?? []).filter((x) => x.id !== docId) }));
    } catch {
      toast.error("Falha de conexão. Tente novamente.");
    }
  }

  return (
    <div className="relative mx-auto max-w-2xl px-4 pb-24 pt-7 sm:px-6">
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

      {/* Hero — impessoal: o que é a página e por quê. Sem apresentação. */}
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] p-7 shadow-[0_8px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-credios-gold/25 bg-credios-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-credios-gold">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-credios-gold" aria-hidden />
          Atendimento personalizado
        </div>
        <h1 className="font-display text-[26px] font-bold leading-tight text-white sm:text-3xl">
          {firstName}, sua operação
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/60">
          Documentos necessários para a nossa mesa de crédito começar a trabalhar a sua
          operação. Envie no seu tempo — salvamos tudo automaticamente.
        </p>

        {total > 0 && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-white/70">
                {enviados} de {total} itens essenciais
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

      <div className="mt-5 space-y-5">
        {/* Valores da operação */}
        <VipValores token={token} initial={valores} />

        {/* Identificação */}
        {secIdentificacao && (
          <Secao
            section={secIdentificacao}
            docs={docs}
            busy={busy}
            onUpload={uploadFiles}
            onRemove={removeDoc}
          />
        )}

        {/* Estado civil (pergunta) + dados do cônjuge quando aplicável —
            é o que define a certidão pedida logo abaixo. */}
        <VipEstadoCivil
          token={token}
          valor={estadoCivil}
          onChange={setEstadoCivil}
          initialConjuge={conjuge}
        />

        {/* Certidão do estado civil, IRPF e imóvel */}
        {secRestantes.map((s) => (
          <Secao
            key={s.categoria + s.titulo}
            section={s}
            docs={docs}
            busy={busy}
            onUpload={uploadFiles}
            onRemove={removeDoc}
          />
        ))}
      </div>

      {completo && (
        <div className="mt-7 rounded-[24px] border border-emerald-400/25 bg-emerald-400/[0.07] p-6 text-center backdrop-blur-xl">
          <CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-400" aria-hidden />
          <h3 className="font-display text-lg font-semibold text-white">
            Recebemos tudo, {firstName}.
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/60">
            Nossa mesa de crédito já começa a trabalhar a sua operação. Se faltar algum
            documento, o consultor entra em contato.
          </p>
        </div>
      )}

      <p className="mt-8 text-center text-[12px] leading-relaxed text-white/35">
        Seus dados são usados apenas para a análise desta operação (LGPD).
      </p>
    </div>
  );
}
