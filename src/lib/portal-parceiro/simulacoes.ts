import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { parceiroInteracoes, parceiroSimulacoes, parceiroUsuarios, parceiros } from "../../../db/schema";
import { db } from "@/lib/db";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { formatPhoneBr } from "@/lib/formatters/phone";
import {
  buildSimulacaoCondominio,
  gerarCodigoSimulacaoCondominio,
  type SimulacaoCondominioResult,
} from "@/lib/simulador/condominio";
import { saneSimulacaoCondominioConfig, type SimulacaoCondominioConfig } from "@/lib/simulador/condominio-config";
import {
  nomeArquivoSimulacaoCondominio,
  renderSimulacaoCondominioPdf,
} from "@/lib/simulador/condominio-pdf";
import { getSimulacaoCondominioConfig } from "@/lib/simulador/config";
import type { SimulacaoCondominioInputPortal } from "@/lib/validators/simulacao-condominio";

import type { ParceiroSessao } from "./sessao";

// Simulações de crédito para condomínio geradas pelo parceiro. Toda leitura
// filtra pelo parceiro_id da sessão. A linha congela as taxas do momento
// (`parametros`): o PDF baixado de novo sai igual ao primeiro.

type Parametros = Pick<
  SimulacaoCondominioConfig,
  "prazos" | "validadeDias" | "iofAdicionalPct" | "iofDiarioPct"
>;

export function podeSimularCondominio(sessao: Pick<ParceiroSessao, "produtosHabilitados">): boolean {
  return sessao.produtosHabilitados.includes("CONDOMINIO");
}

/** Resumo público da config pro parceiro (sem nada além do que sai no PDF). */
export async function resumoCondicoes() {
  const c = await getSimulacaoCondominioConfig();
  const taxas = c.prazos.map((p) => p.taxaAm);
  return {
    prazos: c.prazos.map((p) => p.meses),
    taxaMinAm: Math.min(...taxas),
    taxaMaxAm: Math.max(...taxas),
    valorMinimo: c.valorMinimo,
    valorMaximo: c.valorMaximo,
    validadeDias: c.validadeDias,
  };
}

export type CriarSimulacaoResultado =
  | { ok: true; id: string; codigo: string }
  | { ok: false; erro: string; campos?: Record<string, string> };

export async function criarSimulacao(
  sessao: ParceiroSessao,
  input: SimulacaoCondominioInputPortal,
): Promise<CriarSimulacaoResultado> {
  const config = await getSimulacaoCondominioConfig();
  const reais = input.valorCreditoCentavos / 100;
  if (reais < config.valorMinimo || reais > config.valorMaximo) {
    const msg = `Simule valores entre ${formatBrlFromCents(config.valorMinimo * 100)} e ${formatBrlFromCents(config.valorMaximo * 100)}.`;
    return { ok: false, erro: msg, campos: { valorCreditoCentavos: msg } };
  }

  const parametros: Parametros = {
    prazos: config.prazos,
    validadeDias: config.validadeDias,
    iofAdicionalPct: config.iofAdicionalPct,
    iofDiarioPct: config.iofDiarioPct,
  };

  // Código aleatório com unicidade garantida pelo índice — tenta de novo na colisão.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigoSimulacaoCondominio();
    const [row] = await db
      .insert(parceiroSimulacoes)
      .values({
        codigo,
        parceiroId: sessao.parceiroId,
        usuarioId: sessao.usuarioId,
        produto: "CONDOMINIO",
        condominioNome: input.condominioNome,
        cnpj: input.cnpj,
        valorCreditoCentavos: input.valorCreditoCentavos,
        numUnidades: input.numUnidades,
        finalidade: input.finalidade,
        parametros: parametros as never,
      })
      .onConflictDoNothing({ target: parceiroSimulacoes.codigo })
      .returning({ id: parceiroSimulacoes.id });
    if (!row) continue;

    // Sinal comercial na ficha do parceiro (Histórico).
    await db.insert(parceiroInteracoes).values({
      parceiroId: sessao.parceiroId,
      autorId: null,
      tipo: "evento_sistema",
      conteudo: `${sessao.nome} gerou a simulação ${codigo} no portal: ${input.condominioNome}, ${formatBrlFromCents(input.valorCreditoCentavos)}.`,
      metadata: { kind: "simulacao_condominio", simulacaoId: row.id, codigo },
    });
    return { ok: true, id: row.id, codigo };
  }
  return { ok: false, erro: "Não foi possível gerar a simulação. Tente de novo." };
}

export async function listarSimulacoes(parceiroId: string, limite = 20) {
  return db
    .select({
      id: parceiroSimulacoes.id,
      codigo: parceiroSimulacoes.codigo,
      condominioNome: parceiroSimulacoes.condominioNome,
      cnpj: parceiroSimulacoes.cnpj,
      valorCreditoCentavos: parceiroSimulacoes.valorCreditoCentavos,
      criadoEm: parceiroSimulacoes.criadoEm,
    })
    .from(parceiroSimulacoes)
    .where(eq(parceiroSimulacoes.parceiroId, parceiroId))
    .orderBy(desc(parceiroSimulacoes.criadoEm))
    .limit(limite);
}

/** Dados da simulação pra pré-preencher a indicação (só do próprio parceiro). */
export async function simulacaoDoParceiro(id: string, parceiroId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select()
    .from(parceiroSimulacoes)
    .where(and(eq(parceiroSimulacoes.id, id), eq(parceiroSimulacoes.parceiroId, parceiroId)))
    .limit(1);
  return row ?? null;
}

export async function montarSimulacao(id: string, parceiroId: string): Promise<SimulacaoCondominioResult | null> {
  const row = await simulacaoDoParceiro(id, parceiroId);
  if (!row) return null;

  const [p] = await db
    .select({ nome: parceiros.nome, email: parceiros.email, whatsapp: parceiros.whatsapp })
    .from(parceiros)
    .where(eq(parceiros.id, parceiroId))
    .limit(1);
  const [u] = row.usuarioId
    ? await db
        .select({ nome: parceiroUsuarios.nome, email: parceiroUsuarios.email })
        .from(parceiroUsuarios)
        .where(eq(parceiroUsuarios.id, row.usuarioId))
        .limit(1)
    : [];

  // As taxas são as congeladas na geração; o saneamento só garante o shape.
  const parametros = saneSimulacaoCondominioConfig(row.parametros);
  const nomeParceiro = p?.nome ?? "Parceiro Credios";
  return buildSimulacaoCondominio(
    {
      condominioNome: row.condominioNome,
      cnpj: row.cnpj,
      valorCredito: row.valorCreditoCentavos / 100,
      numUnidades: row.numUnidades,
      finalidade: row.finalidade,
      parceiro: {
        nome: nomeParceiro,
        responsavel: u?.nome && u.nome.trim() !== nomeParceiro.trim() ? u.nome : null,
        email: u?.email || p?.email || null,
        telefone: p?.whatsapp ? formatPhoneBr(p.whatsapp) : null,
      },
    },
    parametros,
    { codigo: row.codigo, geradaEm: row.criadoEm },
  );
}

export async function pdfDaSimulacao(
  id: string,
  parceiroId: string,
): Promise<{ bytes: Uint8Array; nome: string } | null> {
  const sim = await montarSimulacao(id, parceiroId);
  if (!sim) return null;
  return { bytes: await renderSimulacaoCondominioPdf(sim), nome: nomeArquivoSimulacaoCondominio(sim) };
}
