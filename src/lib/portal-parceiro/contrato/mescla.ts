import { formatCpfOrCnpj } from "@/lib/formatters/cpf-cnpj";
import { formatPhoneBr } from "@/lib/formatters/phone";

import {
  COMISSAO_CGI_PADRAO_BPS,
  COMISSAO_CONDOMINIO_BPS,
  CREDIOS,
  PRAZO_CGI_DIAS_UTEIS,
  PRAZO_CONDOMINIO_DIAS_CORRIDOS,
} from "./modelo";

// Preenche os campos {{...}} do modelo com os dados do parceiro. Puro (sem
// banco) pra ser testável.

export type DadosParceiroContrato = {
  nome: string;
  empresa: string | null;
  cpfCnpj: string;
  email: string;
  whatsapp: string | null;
  comissaoPadraoBps: number | null;
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/** Data por extenso no fuso de Brasília: "13 de outubro de 2026". */
export function dataExtenso(d: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0);
  return `${get("day")} de ${MESES[get("month") - 1]} de ${get("year")}`;
}

/** 300 → "3,00" */
export function percentual(bps: number): string {
  return (bps / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const DIGITO: Record<string, string> = {
  "0": "zero", "1": "um", "2": "dois", "3": "três", "4": "quatro",
  "5": "cinco", "6": "seis", "7": "sete", "8": "oito", "9": "nove",
  ",": "vírgula",
};

/** "3,00" → "três vírgula zero zero por cento" (mesma forma dos contratos v1/v2). */
export function percentualExtenso(pct: string): string {
  const palavras = pct.split("").map((c) => DIGITO[c]).filter(Boolean);
  return `${palavras.join(" ")} por cento`;
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function mesclarContrato(
  modelo: string,
  p: DadosParceiroContrato,
  data: Date,
): string {
  const doc = p.cpfCnpj.replace(/\D/g, "");
  const pj = doc.length === 14;
  // PJ: quem contrata é a empresa; a pessoa cadastrada assina como representante.
  const nome = pj && p.empresa ? p.empresa : p.nome;
  const representante =
    pj && p.empresa ? `, neste ato representada por ${escapar(p.nome)}` : "";
  const cgi = percentual(p.comissaoPadraoBps ?? COMISSAO_CGI_PADRAO_BPS);
  const cond = percentual(COMISSAO_CONDOMINIO_BPS);

  const campos: Record<string, string> = {
    "credios.razaoSocial": CREDIOS.razaoSocial,
    "credios.cnpj": CREDIOS.cnpj,
    "credios.endereco": CREDIOS.endereco,
    "parceiro.nome": escapar(nome),
    "parceiro.documento": formatCpfOrCnpj(doc),
    "parceiro.representante": representante,
    "parceiro.email": escapar(p.email),
    "parceiro.telefone": p.whatsapp ? formatPhoneBr(p.whatsapp) : "não informado",
    "comissao.cgi": cgi,
    "comissao.cgiExtenso": percentualExtenso(cgi),
    "comissao.cgiPrazo": String(PRAZO_CGI_DIAS_UTEIS),
    "comissao.condominio": cond,
    "comissao.condominioExtenso": percentualExtenso(cond),
    "comissao.condominioPrazo": String(PRAZO_CONDOMINIO_DIAS_CORRIDOS),
    "contrato.data": dataExtenso(data),
  };
  return modelo.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k: string) => campos[k] ?? m);
}

/** Nome que assina/aparece como parte (empresa, se PJ). */
export function nomeContratual(p: Pick<DadosParceiroContrato, "nome" | "empresa" | "cpfCnpj">): string {
  return p.cpfCnpj.replace(/\D/g, "").length === 14 && p.empresa ? p.empresa : p.nome;
}
