import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { interacoes, leads as leadsTable } from "../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { maskLeadForPerfil } from "@/lib/auth/mascaramento";
import { checkPermission } from "@/lib/auth/permissions";
import {
  nomeDoParceiro,
  registrarDuplicidadeCnpj,
  salvarCondominio,
} from "@/lib/condominio/persist";
import { aoCriarLeadCadencia } from "@/lib/cadencia/engine";
import { db } from "@/lib/db";
import { formatProperName } from "@/lib/formatters/proper-name";
import { registrarDuplicidadeCpf } from "@/lib/leads/duplicidade-cpf";
import { contextFromCreateLead } from "@/lib/routing/context";
import { realRoutingDeps } from "@/lib/routing/db-deps";
import { aplicarRoteamento } from "@/lib/routing/engine";
import { condominioSchema } from "@/lib/validators/condominio";
import { createLeadSchema, listLeadsQuerySchema } from "@/lib/validators/lead";
import { normalizarCpf, normalizarWhatsapp } from "@/lib/validators/webhook";

export async function GET(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!checkPermission(user, "lead.list")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listLeadsQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const q = parsed.data;

  const conds = [];
  // Scope por perfil.
  if (user.perfil === "consultor") {
    conds.push(eq(leadsTable.consultorId, user.id));
  }
  if (q.status.length > 0) conds.push(inArray(leadsTable.status, q.status));
  if (q.consultorId) conds.push(eq(leadsTable.consultorId, q.consultorId));
  if (q.origem) conds.push(eq(leadsTable.origem, q.origem));
  if (q.valorMin != null) conds.push(gte(leadsTable.valorCreditoCentavos, q.valorMin));
  if (q.valorMax != null) conds.push(lte(leadsTable.valorCreditoCentavos, q.valorMax));
  if (q.dataDe) {
    conds.push(gte(leadsTable.createdAt, new Date(`${q.dataDe}T00:00:00Z`)));
  }
  if (q.dataAte) {
    conds.push(lte(leadsTable.createdAt, new Date(`${q.dataAte}T23:59:59Z`)));
  }
  if (q.q) {
    const like = `%${q.q}%`;
    conds.push(
      or(
        ilike(leadsTable.nome, like),
        ilike(leadsTable.email, like),
        ilike(leadsTable.cpf, like),
        ilike(leadsTable.whatsapp, like),
      ),
    );
  }
  const where = conds.length > 0 ? and(...conds) : undefined;
  const offset = (q.page - 1) * q.pageSize;

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(leadsTable)
      .where(where)
      .orderBy(desc(leadsTable.createdAt))
      .limit(q.pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(leadsTable)
      .where(where),
  ]);
  const total = totals[0]?.total ?? 0;

  const data = rows.map((l) => maskLeadForPerfil(l, user.perfil));

  return NextResponse.json({
    data,
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!checkPermission(user, "lead.create")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    // Mensagem útil pro cliente: "campo X: razão · campo Y: razão"
    // (vs o "validation failed" genérico anterior).
    const summary = parsed.error.issues
      .slice(0, 3)
      .map((i) => {
        const path = i.path.join(".") || "(raiz)";
        return `${path}: ${i.message}`;
      })
      .join(" · ");
    return NextResponse.json(
      {
        error: summary || "Dados inválidos",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Atribuição:
  // - consultor: força a si mesmo (não pode escolher outro)
  // - admin/gerente: respeita escolha explícita; se omitida, roda engine
  let consultorId = data.consultorId ?? null;
  let regraAplicada: string | null = null;
  let regraId: string | null = null;

  if (user.perfil === "consultor") {
    if (consultorId && consultorId !== user.id) {
      return NextResponse.json(
        { error: "consultor não pode atribuir leads a outros" },
        { status: 403 },
      );
    }
    if (!consultorId) consultorId = user.id;
  } else if (consultorId == null) {
    const routing = await aplicarRoteamento(
      contextFromCreateLead(data),
      realRoutingDeps,
    );
    consultorId = routing.consultorId;
    regraAplicada = routing.regraAplicada;
    regraId = routing.regraId;
  }

  const cpfClean = normalizarCpf(data.cpf ?? null);
  const whatsappClean = normalizarWhatsapp(data.whatsapp);

  let parceiroNome: string | null = null;
  if (data.parceiroId) {
    parceiroNome = await nomeDoParceiro(data.parceiroId, data.produto ?? "CGI");
    if (!parceiroNome) {
      return NextResponse.json(
        { error: "Parceiro não encontrado ou não habilitado para este produto" },
        { status: 400 },
      );
    }
  }

  const [newLead] = await db
    .insert(leadsTable)
    .values({
      // Title Case PT-BR — uniformiza com os leads que vêm do webhook.
      // Detalhes em src/lib/formatters/proper-name.ts.
      nome: formatProperName(data.nome),
      cpf: cpfClean,
      estadoCivil: data.estadoCivil ?? null,
      ocupacao: data.ocupacao ?? null,
      rendaMensalCentavos: data.rendaMensalCentavos ?? null,
      whatsapp: whatsappClean,
      email: data.email ?? null,
      cidade: data.cidade ?? null,
      estado: data.estado?.toUpperCase() ?? null,
      produto: data.produto ?? "CGI",
      objetivoCredito: data.objetivoCredito ?? null,
      tipoImovel: data.tipoImovel ?? null,
      tipoImovelDetalhes: data.tipoImovelDetalhes ?? null,
      situacaoImovel: data.situacaoImovel ?? null,
      tipoPessoa: data.tipoPessoa ?? null,
      valorImovelCentavos: data.valorImovelCentavos ?? null,
      saldoDevedorCentavos: data.saldoDevedorCentavos ?? null,
      valorCreditoCentavos: data.valorCreditoCentavos ?? null,
      consultorId,
      atribuidoEm: consultorId ? new Date() : null,
      atribuidoPor: consultorId ? user.id : null,
      parceiroId: data.parceiroId ?? null,
      parceiroNome,
      origem: data.origem ?? "Manual",
      createdBy: user.id,
    })
    .returning();

  // Condomínio: dados próprios na tabela-irmã + duplicidade por CNPJ.
  let duplicidadeCnpj: string | null = null;
  if (newLead.produto === "CONDOMINIO") {
    const cond = data.condominio ?? condominioSchema.parse({});
    await salvarCondominio(newLead.id, cond);
    duplicidadeCnpj = await registrarDuplicidadeCnpj(newLead.id, cond.cnpj);
  }
  const duplicidadeCpf = await registrarDuplicidadeCpf(newLead.id, newLead.cpf);
  await aoCriarLeadCadencia(newLead);

  await db.insert(interacoes).values({
    leadId: newLead.id,
    autorId: user.id,
    tipo: "evento_sistema",
    conteudo: `Lead criado manualmente por ${user.nome}${regraAplicada ? ` (engine: ${regraAplicada})` : ""}${duplicidadeCnpj ? " — possível duplicidade por CNPJ" : ""}${duplicidadeCpf ? " — possível duplicidade por CPF" : ""}`,
    metadata: {
      origem: data.origem ?? "Manual",
      consultorId,
      regraAplicada,
      regraId,
    } as never,
  });

  const meta = extractRequestMeta(request);
  // Não-crítico: roda APÓS resposta. Em serverless (Vercel) `void` é
  // interrompido — `after()` mantém execução até completar.
  after(() =>
    logAction(
      null,
      user.id,
      "lead_criado_manual",
      "lead",
      newLead.id,
      { origem: data.origem ?? "Manual", consultorId, regraAplicada, regraId },
      meta,
    ),
  );

  return NextResponse.json({ data: newLead }, { status: 201 });
}
