import "server-only";

import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  leads,
  parceiroComissoes,
  parceiroInteracoes,
  parceiros,
} from "../../../db/schema";
import { db } from "@/lib/db";
import {
  COMISSAO_CONDOMINIO_BPS,
  PRAZO_CONDOMINIO_DIAS_CORRIDOS,
} from "@/lib/portal-parceiro/contrato/modelo";
import { calcularComissao } from "@/lib/validators/comissao";

import { ARQUIVO_MAX_BYTES, somarDias, tipoDoArquivo } from "./arquivo";

// Comissões de parceiro: regras automáticas e leituras do admin.
//
// Decisão do owner (2026-10-13): em CGI a comissão é informada CASO A CASO —
// nada nasce sozinho, o admin registra. Em CONDOMÍNIO é 3% fixo sobre o
// valor líquido, pago de uma vez em até 10 dias corridos da assinatura do
// contrato de crédito — essa nasce no fechamento, já com vencimento.
// Convenção: no lead de condomínio, `data_fechamento` É a data de assinatura
// do contrato de crédito.

type LeadFechado = {
  id: string;
  nome: string;
  produto: string;
  parceiroId: string | null;
  valorLiberadoCentavos: number | null;
  dataFechamento: string | null;
};

/** Lead virou `fechado`. Cria a comissão prevista quando a regra é fixa. */
export async function aoFecharLeadDeParceiro(lead: LeadFechado, autorId: string | null) {
  if (!lead.parceiroId || lead.produto !== "CONDOMINIO") return;
  if (lead.valorLiberadoCentavos == null) return;
  const [ja] = await db
    .select({ id: parceiroComissoes.id })
    .from(parceiroComissoes)
    .where(eq(parceiroComissoes.leadId, lead.id))
    .limit(1);
  if (ja) return;

  const valor = calcularComissao(lead.valorLiberadoCentavos, COMISSAO_CONDOMINIO_BPS);
  const vencimento = lead.dataFechamento
    ? somarDias(lead.dataFechamento, PRAZO_CONDOMINIO_DIAS_CORRIDOS)
    : null;
  try {
    await db.insert(parceiroComissoes).values({
      parceiroId: lead.parceiroId,
      leadId: lead.id,
      baseCentavos: lead.valorLiberadoCentavos,
      percentualBps: COMISSAO_CONDOMINIO_BPS,
      valorCentavos: valor,
      status: "a_pagar",
      vencimento,
      observacao: "Gerada automaticamente no fechamento (condomínio: 3% fixo do contrato).",
      createdBy: autorId,
    });
  } catch (e) {
    // Outro pedido criou no mesmo instante (índice único por lead): tudo certo.
    const err = e as { code?: string; cause?: { code?: string } };
    if (err.code !== "23505" && err.cause?.code !== "23505") throw e;
    return;
  }
  await db.insert(parceiroInteracoes).values({
    parceiroId: lead.parceiroId,
    autorId,
    tipo: "evento_sistema",
    conteudo: `Comissão gerada pelo fechamento de ${lead.nome}${vencimento ? ` — vence em ${vencimento.split("-").reverse().join("/")}` : ""}.`,
    metadata: { kind: "comissao_automatica", leadId: lead.id },
  });
}

/** Lead saiu de `fechado` (reaberto): comissão ainda não paga é cancelada. */
export async function aoReabrirLeadDeParceiro(leadId: string) {
  await db
    .update(parceiroComissoes)
    .set({ status: "cancelada", leadId: null, updatedAt: new Date() })
    .where(
      and(
        eq(parceiroComissoes.leadId, leadId),
        inArray(parceiroComissoes.status, ["prevista", "a_pagar"]),
      ),
    );
}

/** Todas as comissões (admin), mais recentes primeiro. */
export async function listarTodasAsComissoes() {
  return db
    .select({
      id: parceiroComissoes.id,
      parceiroId: parceiroComissoes.parceiroId,
      parceiroNome: parceiros.nome,
      pixChave: parceiros.pixChave,
      leadId: parceiroComissoes.leadId,
      leadNome: leads.nome,
      produto: leads.produto,
      descricao: parceiroComissoes.descricao,
      baseCentavos: parceiroComissoes.baseCentavos,
      percentualBps: parceiroComissoes.percentualBps,
      valorCentavos: parceiroComissoes.valorCentavos,
      status: parceiroComissoes.status,
      vencimento: parceiroComissoes.vencimento,
      pagoEm: parceiroComissoes.pagoEm,
      temComprovante: sql<boolean>`${parceiroComissoes.comprovante} is not null`,
      temNota: sql<boolean>`${parceiroComissoes.notaFiscal} is not null`,
      createdAt: parceiroComissoes.createdAt,
    })
    .from(parceiroComissoes)
    .innerJoin(parceiros, eq(parceiros.id, parceiroComissoes.parceiroId))
    .leftJoin(leads, eq(leads.id, parceiroComissoes.leadId))
    .where(ne(parceiroComissoes.status, "cancelada"))
    .orderBy(desc(parceiroComissoes.createdAt))
    .limit(1000);
}

/** Operações fechadas com parceiro e SEM comissão registrada — a fila do
 *  "caso a caso": o admin precisa decidir o valor de cada uma. */
export async function fechadosSemComissao() {
  return db
    .select({
      leadId: leads.id,
      leadNome: leads.nome,
      produto: leads.produto,
      parceiroId: parceiros.id,
      parceiroNome: parceiros.nome,
      valorLiberadoCentavos: leads.valorLiberadoCentavos,
      dataFechamento: leads.dataFechamento,
    })
    .from(leads)
    .innerJoin(parceiros, eq(parceiros.id, leads.parceiroId))
    .leftJoin(parceiroComissoes, eq(parceiroComissoes.leadId, leads.id))
    .where(and(eq(leads.status, "fechado"), isNull(parceiroComissoes.id)))
    .orderBy(desc(leads.dataFechamento))
    .limit(200);
}

// ── Arquivos (comprovante de pagamento, nota fiscal) ─────────────────────────

export async function lerUpload(
  arquivo: unknown,
): Promise<{ ok: true; bytes: Buffer; mime: string; nome: string } | { ok: false; erro: string }> {
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Selecione um arquivo." };
  }
  if (arquivo.size > ARQUIVO_MAX_BYTES) return { ok: false, erro: "Arquivo acima de 5 MB." };
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const mime = tipoDoArquivo(bytes);
  if (!mime) return { ok: false, erro: "Envie um PDF, PNG ou JPG." };
  const nome = arquivo.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "arquivo";
  return { ok: true, bytes, mime, nome };
}

/** Bytes de um arquivo da comissão. `parceiroId` restringe ao dono. */
export async function arquivoDaComissao(
  comissaoId: string,
  tipo: "comprovante" | "nota",
  parceiroId: string,
) {
  const [c] = await db
    .select(
      tipo === "comprovante"
        ? {
            bytes: parceiroComissoes.comprovante,
            nome: parceiroComissoes.comprovanteNome,
            mime: parceiroComissoes.comprovanteMime,
          }
        : {
            bytes: parceiroComissoes.notaFiscal,
            nome: parceiroComissoes.notaFiscalNome,
            mime: parceiroComissoes.notaFiscalMime,
          },
    )
    .from(parceiroComissoes)
    .where(and(eq(parceiroComissoes.id, comissaoId), eq(parceiroComissoes.parceiroId, parceiroId)))
    .limit(1);
  if (!c?.bytes) return null;
  return { bytes: c.bytes, nome: c.nome ?? "arquivo", mime: c.mime ?? "application/octet-stream" };
}

export function respostaDeArquivo(a: { bytes: Buffer; nome: string; mime: string }) {
  return new Response(new Uint8Array(a.bytes), {
    headers: {
      "content-type": a.mime,
      "content-disposition": `attachment; filename="${a.nome.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
