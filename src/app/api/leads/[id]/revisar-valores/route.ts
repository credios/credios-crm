import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  interacoes,
  leads as leadsTable,
} from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  CAMPO_LABEL,
  calcularValoresCorrigidos,
  type ValoresSuspeitos,
} from "@/lib/leads/valores-suspeitos";

type Ctx = { params: Promise<{ id: string }> };

const revisarSchema = z.object({
  acao: z.enum(["aceitar", "manter"]),
});

/**
 * POST /api/leads/[id]/revisar-valores
 *
 * Resolve flag `valores_suspeitos` num lead. Duas ações:
 *   - `aceitar`: aplica correção sugerida (÷1000 nos campos estourados).
 *     Reverte valores em centavos no banco.
 *   - `manter`: confirma que os valores originais estão corretos
 *     (cliente realmente é high-net-worth). Não altera valores.
 *
 * Ambas marcam o lead como revisado (valores_revisado_em preenchido)
 * e registram interação na timeline + audit log.
 *
 * Permissão: admin/gerente. Consultor NÃO revisa (regra de governança:
 * é um sinal de qualidade dos dados, decidido por quem gerencia).
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminOrGerente(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!lead.valoresSuspeitos) {
    return NextResponse.json(
      { error: "Lead não tem valores suspeitos pra revisar." },
      { status: 400 },
    );
  }
  if (lead.valoresRevisadoEm) {
    return NextResponse.json(
      { error: "Valores já foram revisados anteriormente." },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = revisarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { acao } = parsed.data;

  const suspeitos = lead.valoresSuspeitos as ValoresSuspeitos;
  const now = new Date();

  // Monta o update conforme ação escolhida.
  const updateData: Record<string, unknown> = {
    valoresRevisadoEm: now,
    valoresRevisadoPor: user.id,
    valoresRevisadoAcao: acao === "aceitar" ? "dividido_por_1000" : "mantido",
    updatedAt: now,
  };

  // Mensagem da timeline — montada antes pra ser consistente com o estado novo.
  let conteudoInteracao = "";

  if (acao === "aceitar") {
    // Aplica correção: ÷1000 nos campos estourados, preservando os ok.
    // Trabalhamos em REAIS (suspeitos.valoresOriginais está em reais),
    // depois convertemos pra centavos.
    const corrigidos = calcularValoresCorrigidos(
      {
        rendaMensal: suspeitos.valoresOriginais.renda ?? null,
        valorImovel: suspeitos.valoresOriginais.imovel ?? null,
        saldoDevedor: suspeitos.valoresOriginais.saldo ?? null,
        valorCredito: suspeitos.valoresOriginais.credito ?? null,
      },
      suspeitos,
    );

    // Só atualiza os campos que estavam suspeitos (preservar campos ok).
    const partes: string[] = [];
    if (suspeitos.campos.renda && corrigidos.rendaMensal != null) {
      updateData.rendaMensalCentavos = Math.round(corrigidos.rendaMensal * 100);
      partes.push(
        `Renda: R$ ${(suspeitos.valoresOriginais.renda ?? 0).toLocaleString("pt-BR")} → R$ ${corrigidos.rendaMensal.toLocaleString("pt-BR")}`,
      );
    }
    if (suspeitos.campos.imovel && corrigidos.valorImovel != null) {
      updateData.valorImovelCentavos = Math.round(corrigidos.valorImovel * 100);
      partes.push(
        `Valor do imóvel: R$ ${(suspeitos.valoresOriginais.imovel ?? 0).toLocaleString("pt-BR")} → R$ ${corrigidos.valorImovel.toLocaleString("pt-BR")}`,
      );
    }
    if (suspeitos.campos.saldo && corrigidos.saldoDevedor != null) {
      updateData.saldoDevedorCentavos = Math.round(
        corrigidos.saldoDevedor * 100,
      );
      partes.push(
        `Saldo devedor: R$ ${(suspeitos.valoresOriginais.saldo ?? 0).toLocaleString("pt-BR")} → R$ ${corrigidos.saldoDevedor.toLocaleString("pt-BR")}`,
      );
    }
    if (suspeitos.campos.credito && corrigidos.valorCredito != null) {
      updateData.valorCreditoCentavos = Math.round(
        corrigidos.valorCredito * 100,
      );
      partes.push(
        `Crédito buscado: R$ ${(suspeitos.valoresOriginais.credito ?? 0).toLocaleString("pt-BR")} → R$ ${corrigidos.valorCredito.toLocaleString("pt-BR")}`,
      );
    }

    conteudoInteracao = `Valores corrigidos (÷1000) por ${user.nome}: ${partes.join(" · ")}`;
  } else {
    // Manter — só registra confirmação.
    const camposLista = Object.keys(suspeitos.campos)
      .filter((k) => suspeitos.campos[k as keyof typeof suspeitos.campos])
      .map((k) => CAMPO_LABEL[k as keyof typeof CAMPO_LABEL])
      .join(", ");
    conteudoInteracao = `Valores confirmados por ${user.nome}: ${camposLista} mantido(s) como informado(s).`;
  }

  // Update atomic: lead + interação.
  await db.transaction(async (tx) => {
    await tx
      .update(leadsTable)
      .set(updateData)
      .where(eq(leadsTable.id, id));
    await tx.insert(interacoes).values({
      leadId: id,
      autorId: user.id,
      tipo: "evento_sistema",
      conteudo: conteudoInteracao,
      metadata: {
        evento: "revisao_valores_suspeitos",
        acao,
        campos_suspeitos: suspeitos.campos,
        valores_originais: suspeitos.valoresOriginais,
      } as never,
    });
  });

  // Audit log (após resposta).
  after(() =>
    logAction(
      null,
      user.id,
      "lead_valores_revisados",
      "lead",
      id,
      { acao, campos_suspeitos: suspeitos.campos },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ ok: true, acao });
}
