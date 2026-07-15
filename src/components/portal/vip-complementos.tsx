"use client";

import { Check, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { PortalIcon } from "./portal-icons";
import {
  ESTADO_CIVIL_VIP_CRM,
  ESTADO_CIVIL_VIP_LABEL,
  exigeConjuge,
  type EstadoCivilVip,
} from "@/lib/portal/checklist-vip";

// Complementos do portal VIP. Cada campo salva NO CRM ao sair do campo
// (onBlur) — o consultor vê o dado chegar em tempo real, e o cliente não
// perde nada se fechar a página no meio. Sem botão "salvar": o estado de
// cada campo é o próprio feedback (spinner → check verde).

type Campo =
  | "valorImovel"
  | "valorCredito"
  | "conjugeNome"
  | "conjugeEmail"
  | "conjugeWhatsapp";
type Estado = "idle" | "salvando" | "salvo" | "erro";

const INPUT =
  "w-full h-12 rounded-xl border border-white/15 bg-white/[0.04] px-3.5 text-[15px] text-white placeholder:text-white/25 transition-colors focus:border-credios-blue/60 focus:outline-none focus:ring-2 focus:ring-credios-blue/20";

function brlMask(v: string): string {
  const n = parseInt(v.replace(/\D/g, ""), 10) || 0;
  return n === 0 ? "" : "R$ " + n.toLocaleString("pt-BR");
}

function foneMask(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Feedback do autosave: spinner → check verde (ou aviso de falha). */
function Selo({ estado }: { estado: Estado | undefined }) {
  if (estado === "salvando") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" aria-hidden />;
  }
  if (estado === "salvo") {
    return <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />;
  }
  if (estado === "erro") {
    return <span className="text-[11px] font-medium text-rose-300">não salvou</span>;
  }
  return null;
}

function Label({
  children,
  estado,
}: {
  children: React.ReactNode;
  estado: Estado | undefined;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <label className="text-[13px] font-medium text-white/70">{children}</label>
      <Selo estado={estado} />
    </div>
  );
}

async function patch(token: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`/api/portal/${token}/complementos`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Valores da operação (imóvel/crédito). */
export function VipValores({
  token,
  initial,
}: {
  token: string;
  initial: { valorImovel: string; valorCredito: string };
}) {
  const [vals, setVals] = useState(initial);
  const [estado, setEstado] = useState<Partial<Record<Campo, Estado>>>({});
  const salvo = useRef({ ...initial });

  async function salvar(campo: "valorImovel" | "valorCredito", bruto: string) {
    if (bruto === salvo.current[campo]) return;
    const n = Number(bruto.replace(/\D/g, ""));
    if (!n) return;
    setEstado((e) => ({ ...e, [campo]: "salvando" }));
    const ok = await patch(token, { [campo]: n });
    if (ok) salvo.current[campo] = bruto;
    setEstado((e) => ({ ...e, [campo]: ok ? "salvo" : "erro" }));
  }

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_6px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-credios-blue/15 ring-1 ring-credios-blue/25">
          <PortalIcon name="personalizado" className="h-5 w-5 text-credios-blue" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-white">
            Dados da operação
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug text-white/50">
            Salvamos automaticamente conforme você preenche.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label estado={estado.valorImovel}>Valor do imóvel</Label>
          <input
            className={INPUT}
            inputMode="numeric"
            placeholder="R$ 0"
            value={vals.valorImovel}
            onChange={(e) => setVals((v) => ({ ...v, valorImovel: brlMask(e.target.value) }))}
            onBlur={(e) => void salvar("valorImovel", e.target.value)}
          />
        </div>
        <div>
          <Label estado={estado.valorCredito}>Valor do crédito que você busca</Label>
          <input
            className={INPUT}
            inputMode="numeric"
            placeholder="R$ 0"
            value={vals.valorCredito}
            onChange={(e) => setVals((v) => ({ ...v, valorCredito: brlMask(e.target.value) }))}
            onBlur={(e) => void salvar("valorCredito", e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Estado civil + (quando casado/união estável) dados do cônjuge.
 * Confirmar a situação primeiro é o que define a certidão pedida na lista —
 * por isso o `onChange` avisa o pai, que recalcula a checklist na hora.
 */
export function VipEstadoCivil({
  token,
  valor,
  onChange,
  initialConjuge,
}: {
  token: string;
  valor: EstadoCivilVip | null;
  onChange: (v: EstadoCivilVip) => void;
  initialConjuge: { nome: string; email: string; whatsapp: string };
}) {
  const [conj, setConj] = useState(initialConjuge);
  const [estado, setEstado] = useState<Partial<Record<Campo, Estado>>>({});
  const [salvandoEc, setSalvandoEc] = useState(false);
  const salvo = useRef({
    conjugeNome: initialConjuge.nome,
    conjugeEmail: initialConjuge.email,
    conjugeWhatsapp: initialConjuge.whatsapp,
  });

  async function escolher(ec: EstadoCivilVip) {
    onChange(ec); // recalcula a checklist imediatamente (sem esperar a rede)
    setSalvandoEc(true);
    await patch(token, { estadoCivil: ESTADO_CIVIL_VIP_CRM[ec] });
    setSalvandoEc(false);
  }

  async function salvarConj(
    campo: "conjugeNome" | "conjugeEmail" | "conjugeWhatsapp",
    bruto: string,
  ) {
    if (bruto === salvo.current[campo]) return;
    if (campo === "conjugeWhatsapp" && bruto.replace(/\D/g, "").length < 10) return;
    if (campo !== "conjugeWhatsapp" && bruto.trim().length < 2) return;
    setEstado((e) => ({ ...e, [campo]: "salvando" }));
    const ok = await patch(token, { [campo]: bruto.trim() });
    if (ok) salvo.current[campo] = bruto;
    setEstado((e) => ({ ...e, [campo]: ok ? "salvo" : "erro" }));
  }

  const opcoes = Object.keys(ESTADO_CIVIL_VIP_LABEL) as EstadoCivilVip[];

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_6px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-credios-blue/15 ring-1 ring-credios-blue/25">
          <PortalIcon name="estado_civil" className="h-5 w-5 text-credios-blue" />
        </div>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-white">
            Estado civil
            {salvandoEc && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" aria-hidden />}
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug text-white/50">
            Confirme para sabermos qual certidão pedir.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {opcoes.map((ec) => (
          <button
            key={ec}
            type="button"
            onClick={() => void escolher(ec)}
            className={`cursor-pointer rounded-2xl border px-3 py-3 text-sm font-semibold transition-colors ${
              valor === ec
                ? "border-credios-gold/60 bg-credios-gold/10 text-credios-gold"
                : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20"
            }`}
          >
            {ESTADO_CIVIL_VIP_LABEL[ec]}
          </button>
        ))}
      </div>

      {exigeConjuge(valor) && (
        <div className="mt-5 rounded-2xl border border-credios-gold/20 bg-credios-gold/[0.04] p-4">
          <p className="text-[13px] font-semibold text-credios-gold">
            Dados do seu cônjuge
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-white/55">
            O banco parceiro exige o cadastro dele(a) na operação — o e-mail e o celular
            são usados para a assinatura eletrônica do contrato.
          </p>

          <div className="mt-4 grid gap-4">
            <div>
              <Label estado={estado.conjugeNome}>Nome completo</Label>
              <input
                className={INPUT}
                placeholder="Nome como consta no documento"
                value={conj.nome}
                onChange={(e) => setConj((c) => ({ ...c, nome: e.target.value }))}
                onBlur={(e) => void salvarConj("conjugeNome", e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label estado={estado.conjugeEmail}>E-mail</Label>
                <input
                  className={INPUT}
                  type="email"
                  inputMode="email"
                  autoCapitalize="off"
                  placeholder="email@exemplo.com"
                  value={conj.email}
                  onChange={(e) => setConj((c) => ({ ...c, email: e.target.value }))}
                  onBlur={(e) => void salvarConj("conjugeEmail", e.target.value)}
                />
              </div>
              <div>
                <Label estado={estado.conjugeWhatsapp}>Celular</Label>
                <input
                  className={INPUT}
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  value={conj.whatsapp}
                  onChange={(e) =>
                    setConj((c) => ({ ...c, whatsapp: foneMask(e.target.value) }))
                  }
                  onBlur={(e) => void salvarConj("conjugeWhatsapp", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
