import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  interacoes,
  leads as leadsTable,
} from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { generateSimulationId } from "@/lib/simulador/simulation-id";
import { simpleSimulatorSchema } from "@/lib/simulador/validator";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/[id]/simulacao
 *
 * Registra uma simulação gerada pra esse lead. Fluxo:
 *   1. Valida o body com o mesmo schema do simulador (LTV ≤ 60%, etc.).
 *   2. Gera um simulationId único (HE-AAAA-NNNN).
 *   3. Insere uma `interacao` tipo `evento_sistema` com o ID e os parâmetros
 *      no metadata — vira uma linha visível na timeline do lead.
 *   4. Devolve `{ simulationId }` pro caller usar no PDF.
 *
 * Por que separar em endpoint (em vez de só registrar quando a página do
 * PDF abre): assim 1 click = 1 evento na timeline. Se o consultor recarrega
 * a aba do PDF, não duplica. O ID é gerado aqui e propagado pra URL do PDF.
 *
 * Auditoria: além da interação na timeline (visível pro consultor),
 * `logAction` registra em `audit_log` (visível só pro admin) com IP/UA.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Marketing tem dados mascarados — uma simulação criada por marketing
  // teria CPF/valores inválidos. Bloqueado pra evitar lixo no histórico.
  if (user.perfil === "marketing") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [lead] = await db
    .select({ id: leadsTable.id, consultorId: leadsTable.consultorId })
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Mesma checagem da página de detalhe — quem pode ler o lead pode gerar
  // simulação. Consultor só vê os próprios via RLS-equivalente do
  // `checkPermission`.
  if (
    !checkPermission(user, "lead.read", {
      type: "lead",
      consultorId: lead.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = simpleSimulatorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation failed",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const simulationId = generateSimulationId();

  // Conteúdo legível no card de timeline. Inclui sistema, indexação,
  // valor buscado e taxa — o suficiente pra contextualizar a entrada
  // sem precisar abrir o metadata.
  const sistemaLabel =
    data.amortizationType === "price" ? "Tabela Price" : "SAC";
  const indexLabel =
    data.indexation === "pre" ? "Pré-fixado" : "Pós-fixado (IPCA +)";
  const taxaFmt = data.interestRate.toFixed(2).replace(".", ",");
  const valorFmt = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(data.creditAmount);

  const conteudo = [
    `Simulação ${simulationId} gerada e enviada ao cliente`,
    `${valorFmt} · ${data.installments} meses · ${sistemaLabel} ${indexLabel} · ${taxaFmt}% a.m.`,
  ].join("\n");

  // Insere a interação. A timeline da página do lead carrega isso na
  // primeira página (mais recentes primeiro) automaticamente.
  await db.insert(interacoes).values({
    leadId: id,
    autorId: user.id,
    tipo: "evento_sistema",
    conteudo,
    metadata: {
      kind: "simulacao_gerada",
      simulation_id: simulationId,
      client_name: data.clientName,
      // CPF gravado mascarado pra reduzir exposição em logs/exports.
      client_cpf_masked: data.clientCPF
        ? data.clientCPF.replace(
            /^(\d{3})\.(\d{3})\.(\d{3})-(\d{2})$/,
            "$1.***.***-$4",
          )
        : null,
      credit_amount: data.creditAmount,
      property_value: data.propertyValue,
      ltv: Number(((data.creditAmount / data.propertyValue) * 100).toFixed(2)),
      interest_rate: data.interestRate,
      installments: data.installments,
      amortization_type: data.amortizationType,
      indexation: data.indexation,
    },
  });

  // Audit log paralelo. `after()` deixa pro próximo tick — não bloqueia
  // a resposta pro cliente.
  after(() =>
    logAction(
      null,
      user.id,
      "simulacao_gerada",
      "lead",
      id,
      {
        simulation_id: simulationId,
        credit_amount: data.creditAmount,
        installments: data.installments,
        amortization_type: data.amortizationType,
        indexation: data.indexation,
      },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ simulationId });
}
