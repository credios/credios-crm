import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { interacoes, leads as leadsTable } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { buscarCondominio } from "@/lib/condominio/persist";
import { todayYmdBrt } from "@/lib/datetime/brt";
import { db } from "@/lib/db";
import { ehCgi } from "@/lib/produtos";
import { buildSimulacaoFundo, gerarCodigoSimulacaoFundo } from "@/lib/simulador/fundo";
import { nomeArquivoSimulacaoFundo, renderSimulacaoFundoPdf } from "@/lib/simulador/fundo-pdf";
import { simulacaoFundoSchema } from "@/lib/validators/simulacao-fundo";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/[id]/simulacao-fundo — gera o PDF da simulação do fundo
 * (Musashi Capital) com valor, prazos e taxas informados por quem gera, e
 * devolve o arquivo. Grava o evento na timeline com todos os parâmetros —
 * dá pra refazer o mesmo PDF a partir do metadata.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Marketing não opera o lead (telas operacionais fechadas, §5).
  if (user.perfil === "marketing") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [lead] = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      consultorId: leadsTable.consultorId,
      produto: leadsTable.produto,
    })
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!checkPermission(user, "lead.read", { type: "lead", consultorId: lead.consultorId })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const produto = lead.produto === "CONDOMINIO" ? "CONDOMINIO" : ehCgi(lead) ? "CGI" : null;
  if (!produto) {
    return NextResponse.json(
      { error: "Simulação do fundo disponível para CGI e condomínio." },
      { status: 422 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = simulacaoFundoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const cnpj = produto === "CONDOMINIO" ? ((await buscarCondominio(lead.id))?.cnpj ?? null) : null;
  const geradaEm = todayYmdBrt();
  const codigo = gerarCodigoSimulacaoFundo(Number(geradaEm.slice(0, 4)));

  const sim = buildSimulacaoFundo(
    {
      valorCredito: data.valorCredito,
      prazos: data.prazos,
      indexacao: data.indexacao,
      iof: data.iof,
      produto,
      cliente: { nome: lead.nome, cnpj },
      contato: { nome: user.nome, email: user.email, whatsapp: user.whatsapp },
    },
    { codigo, geradaEm },
  );
  const pdf = await renderSimulacaoFundoPdf(sim);

  const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const pct = (v: number) =>
    `${data.indexacao === "ipca" ? "IPCA + " : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;

  await db.insert(interacoes).values({
    leadId: id,
    autorId: user.id,
    tipo: "evento_sistema",
    conteudo: [
      `Simulação do fundo ${codigo} gerada (válida até ${sim.validaAte.split("-").reverse().join("/")})`,
      `${brl(sim.valorCredito)} · ${sim.linhas.map((l) => `${l.meses}m a ${pct(l.taxaAm)} a.m. → ${brl(l.parcela)}`).join(" · ")}`,
    ].join("\n"),
    metadata: {
      kind: "simulacao_fundo_gerada",
      codigo,
      gerada_em: sim.geradaEm,
      valida_ate: sim.validaAte,
      valor_credito: sim.valorCredito,
      indexacao: sim.indexacao,
      iof: sim.iof,
      prazos: sim.linhas.map((l) => ({ meses: l.meses, taxa_am: l.taxaAm, parcela: Number(l.parcela.toFixed(2)) })),
    } as never,
  });

  after(() =>
    logAction(
      null,
      user.id,
      "simulacao_fundo_gerada",
      "lead",
      id,
      { codigo, valor_credito: sim.valorCredito, prazos: data.prazos, indexacao: data.indexacao, iof: data.iof },
      extractRequestMeta(request),
    ),
  );

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${nomeArquivoSimulacaoFundo(sim)}"`,
      "x-simulacao-codigo": codigo,
      "cache-control": "private, no-store",
    },
  });
}
