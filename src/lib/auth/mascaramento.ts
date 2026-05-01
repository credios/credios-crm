import type { Perfil } from "./types";

const FAIXAS_RENDA = [
  { max: 500_000, label: "Até R$ 5k" },
  { max: 1_000_000, label: "R$ 5k–10k" },
  { max: 2_000_000, label: "R$ 10k–20k" },
  { max: 5_000_000, label: "R$ 20k–50k" },
] as const;

export function maskCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  const last2 = digits.slice(-2).padStart(2, "•");
  return `***.***.***-${last2}`;
}

export function rendaParaFaixa(centavos: number | null | undefined): string | null {
  if (centavos == null) return null;
  for (const f of FAIXAS_RENDA) {
    if (centavos < f.max) return f.label;
  }
  return "Acima R$ 50k";
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return "***";
  return `***@${email.slice(at + 1)}`;
}

export function shouldMaskFor(perfil: Perfil): boolean {
  return perfil === "marketing";
}

export type LeadLikeForMasking = {
  cpf: string | null;
  rendaMensalCentavos: number | null;
  whatsapp: string | null;
  email: string | null;
  bancoAprovador?: string | null;
  valorLiberadoCentavos?: number | null;
  comissaoCentavos?: number | null;
};

export type MaskedLeadFields = {
  rendaFaixa: string | null;
};

/**
 * Aplica mascaramento PII para perfil 'marketing' (CLAUDE.md §5).
 * Para outros perfis retorna o objeto original sem alterações.
 *
 * Mascarado:
 *  - cpf: '***.***.***-XX'
 *  - email: '***@dominio.com'
 *  - whatsapp: null (oculto)
 *  - rendaMensalCentavos: null + adiciona rendaFaixa
 *  - dados financeiros (banco, valor liberado, comissão): null
 */
export function maskLeadForPerfil<T extends LeadLikeForMasking>(
  lead: T,
  perfil: Perfil,
): T & Partial<MaskedLeadFields> {
  if (!shouldMaskFor(perfil)) return lead;
  return {
    ...lead,
    cpf: maskCpf(lead.cpf),
    email: maskEmail(lead.email),
    whatsapp: null,
    rendaMensalCentavos: null,
    rendaFaixa: rendaParaFaixa(lead.rendaMensalCentavos),
    bancoAprovador: null,
    valorLiberadoCentavos: null,
    comissaoCentavos: null,
  };
}
