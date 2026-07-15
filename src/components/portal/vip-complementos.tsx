"use client";

import { Check, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { PortalIcon } from "./portal-icons";

// Complementos do portal VIP. Cada campo salva NO CRM ao sair do campo
// (onBlur) — o consultor vê o dado chegar em tempo real, e o cliente não
// perde nada se fechar a página no meio. Sem botão "salvar": o estado de
// cada campo é o próprio feedback (spinner → check verde).

type Campo = "valorImovel" | "valorCredito" | "conjugeNome" | "conjugeEmail" | "conjugeWhatsapp";
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

export function VipComplementos({
  token,
  initial,
}: {
  token: string;
  initial: {
    valorImovel: string;
    valorCredito: string;
    conjugeNome: string;
    conjugeEmail: string;
    conjugeWhatsapp: string;
  };
}) {
  const [vals, setVals] = useState(initial);
  const [estado, setEstado] = useState<Partial<Record<Campo, Estado>>>({});
  // Guarda o último valor SALVO — evita PATCH quando o cliente só passa o
  // foco pelo campo sem mudar nada.
  const salvo = useRef({ ...initial });

  async function salvar(campo: Campo, valorBruto: string) {
    if (valorBruto === salvo.current[campo]) return;
    const payload: Record<string, unknown> = {};
    if (campo === "valorImovel" || campo === "valorCredito") {
      const n = Number(valorBruto.replace(/\D/g, ""));
      if (!n) return;
      payload[campo] = n;
    } else if (campo === "conjugeWhatsapp") {
      if (valorBruto.replace(/\D/g, "").length < 10) return;
      payload[campo] = valorBruto;
    } else {
      if (valorBruto.trim().length < 2) return;
      payload[campo] = valorBruto.trim();
    }

    setEstado((e) => ({ ...e, [campo]: "salvando" }));
    try {
      const res = await fetch(`/api/portal/${token}/complementos`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setEstado((e) => ({ ...e, [campo]: "erro" }));
        return;
      }
      salvo.current[campo] = valorBruto;
      setEstado((e) => ({ ...e, [campo]: "salvo" }));
    } catch {
      setEstado((e) => ({ ...e, [campo]: "erro" }));
    }
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

      <div className="mt-6 rounded-2xl border border-credios-gold/20 bg-credios-gold/[0.04] p-4">
        <p className="text-[13px] font-semibold text-credios-gold">Dados da sua esposa</p>
        <p className="mt-1 text-[12.5px] leading-snug text-white/55">
          O banco parceiro exige o cadastro dela na operação — o e-mail e o celular são
          usados para a assinatura eletrônica do contrato.
        </p>

        <div className="mt-4 grid gap-4">
          <div>
            <Label estado={estado.conjugeNome}>Nome completo</Label>
            <input
              className={INPUT}
              placeholder="Nome como consta no documento"
              value={vals.conjugeNome}
              onChange={(e) => setVals((v) => ({ ...v, conjugeNome: e.target.value }))}
              onBlur={(e) => void salvar("conjugeNome", e.target.value)}
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
                value={vals.conjugeEmail}
                onChange={(e) => setVals((v) => ({ ...v, conjugeEmail: e.target.value }))}
                onBlur={(e) => void salvar("conjugeEmail", e.target.value)}
              />
            </div>
            <div>
              <Label estado={estado.conjugeWhatsapp}>Celular</Label>
              <input
                className={INPUT}
                inputMode="tel"
                placeholder="(00) 00000-0000"
                value={vals.conjugeWhatsapp}
                onChange={(e) =>
                  setVals((v) => ({ ...v, conjugeWhatsapp: foneMask(e.target.value) }))
                }
                onBlur={(e) => void salvar("conjugeWhatsapp", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
