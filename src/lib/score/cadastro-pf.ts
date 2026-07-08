import "server-only";

import { eq } from "drizzle-orm";

import { interacoes, leads as leadsTable } from "../../../db/schema";
import { db } from "@/lib/db";

// Cadastro PF Plus (Direct Data) — consulta AUTOMÁTICA em todo formulário
// completo com CPF (barata; decisão do owner 2026-07-08). Traz nome oficial,
// situação cadastral na Receita, óbito, renda estimada, CBO/profissão, classe
// social, telefones/e-mails/endereços conhecidos e perfil domiciliar. O
// `retorno` bruto fica em leads.cadastro_pf; a UI organiza a leitura.

const API_URL = "https://apiv3.directd.com.br/api/CadastroPessoaFisicaPlus";

export type CadastroPf = {
  nome?: string | null;
  sexo?: string | null;
  dataNascimento?: string | null;
  idade?: number | null;
  nomeMae?: string | null;
  nomePai?: string | null;
  rendaEstimada?: number | null;
  rendaFaixaSalarial?: string | null;
  obito?: boolean | null;
  cbo?: string | null;
  classeSocial?: string | null;
  situacaoCadastral?: string | null;
  dataSituacaoCadastral?: string | null;
  telefones?: Array<{
    telefoneComDDD?: string;
    operadora?: string;
    tipoTelefone?: string;
    whatsApp?: boolean;
  }> | null;
  enderecos?: Array<{
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
  }> | null;
  emails?: Array<{ enderecoEmail?: string }> | null;
  perfilDomiciliar?: {
    tipoDomicilio?: string;
    quantidadeMoradores?: number;
    rendaDomiciliar?: string;
    rendaPerCapita?: string;
    faixaRendaPerCapita?: string;
    confiabilidade?: string;
  } | null;
};

/** Consulta e grava o Cadastro PF do lead. Dedup: no-op se já consultado.
 *  Best-effort: falha nunca propaga (loga e segue). */
export async function consultarCadastroPfLead(leadId: string): Promise<void> {
  try {
    const token = process.env.DIRECTD_TOKEN;
    if (!token) return;
    const [lead] = await db
      .select({
        id: leadsTable.id,
        cpf: leadsTable.cpf,
        cadastroPfEm: leadsTable.cadastroPfEm,
      })
      .from(leadsTable)
      .where(eq(leadsTable.id, leadId))
      .limit(1);
    if (!lead) return;
    const cpf = (lead.cpf ?? "").replace(/\D/g, "");
    if (cpf.length !== 11 || lead.cadastroPfEm) return;

    const res = await fetch(
      `${API_URL}?CPF=${cpf}&TOKEN=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(15_000), cache: "no-store" },
    );
    const payload = (await res.json()) as {
      metaDados?: { resultadoId?: number; mensagem?: string };
      retorno?: CadastroPf | null;
    };
    if (!res.ok || payload?.metaDados?.resultadoId !== 1 || !payload.retorno) {
      console.error(
        `[cadastro-pf] falha lead ${leadId}: ${payload?.metaDados?.mensagem ?? res.status}`,
      );
      return;
    }

    const r = payload.retorno;
    await db
      .update(leadsTable)
      .set({ cadastroPf: r as never, cadastroPfEm: new Date() })
      .where(eq(leadsTable.id, leadId));

    const renda =
      r.rendaEstimada != null
        ? ` · renda estimada ${r.rendaEstimada.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`
        : "";
    await db.insert(interacoes).values({
      leadId,
      autorId: null,
      tipo: "evento_sistema",
      conteudo: `Cadastro PF consultado — Receita: ${r.situacaoCadastral ?? "?"}${r.obito ? " · ⚠️ ÓBITO" : ""}${renda}`,
      metadata: {
        kind: "cadastro_pf_consultado",
        situacao: r.situacaoCadastral ?? null,
        obito: r.obito ?? null,
        renda_estimada: r.rendaEstimada ?? null,
      } as never,
    });
  } catch (e) {
    console.error("[cadastro-pf] consulta falhou:", e);
  }
}
