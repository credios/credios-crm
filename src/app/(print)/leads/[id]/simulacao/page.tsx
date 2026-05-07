import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { leads as leadsTable } from "../../../../../../db/schema";
import { SimulacaoRenderer } from "@/components/leads/simulacao-renderer";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  buildSimulationResult,
  type AmortizationType,
  type Indexation,
} from "@/lib/simulador/simple-simulator";
import {
  generateSimulationId,
  isValidSimulationId,
} from "@/lib/simulador/simulation-id";
import { simpleSimulatorSchema } from "@/lib/simulador/validator";

// Página standalone (route group `(print)`) sem sidebar/nav. Aberta em uma
// nova aba pelo card de simulação no detalhe do lead. Calcula a simulação
// no servidor (motor é função pura, instantâneo) e renderiza o PDF — o
// componente cliente dispara `window.print()` ao montar.
//
// Auth: o usuário precisa estar logado e ter `lead.read` no lead-alvo
// (mesma checagem da página de detalhe). Se falha, redireciona pra
// /sem-permissao.

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function asString(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function asNumber(v: string | string[] | undefined, fallback = 0): number {
  const s = asString(v).replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export default async function SimulacaoPage({ params, searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;

  // Carrega o lead pra (1) checar permissão e (2) garantir fallback nos campos
  // caso a URL não traga tudo (improvável — o card sempre manda).
  const [row] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!row) notFound();

  if (
    !checkPermission(user, "lead.read", {
      type: "lead",
      consultorId: row.consultorId,
    })
  ) {
    redirect("/sem-permissao");
  }

  // Monta o input do simulador a partir dos query params, com fallback pros
  // dados do lead. Se ainda assim ficar inválido, renderizamos uma tela de
  // erro pedindo pro usuário voltar e preencher.
  const input = {
    clientName: asString(sp.nome) || row.nome,
    clientCPF: asString(sp.cpf) || row.cpf || "",
    creditAmount:
      asNumber(sp.credito) ||
      (row.valorCreditoCentavos
        ? Math.round(row.valorCreditoCentavos / 100)
        : 0),
    propertyValue:
      asNumber(sp.imovel) ||
      (row.valorImovelCentavos
        ? Math.round(row.valorImovelCentavos / 100)
        : 0),
    interestRate: asNumber(sp.taxa),
    installments: Math.round(asNumber(sp.prazo, 180)),
    amortizationType: (asString(sp.tipo) === "sac"
      ? "sac"
      : "price") as AmortizationType,
    indexation: (asString(sp.idx) === "pre" ? "pre" : "pos") as Indexation,
  };

  const parsed = simpleSimulatorSchema.safeParse(input);
  if (!parsed.success) {
    return (
      <div className="max-w-xl mx-auto p-8 text-sm text-gray-700 space-y-3">
        <h1 className="text-lg font-semibold text-gray-900">
          Não foi possível gerar a simulação
        </h1>
        <p className="text-gray-600">
          {parsed.error.issues[0]?.message ?? "Verifique os dados informados."}
        </p>
        <p className="text-xs text-gray-500">
          Volte pra ficha do lead e ajuste os valores no card de simulação.
        </p>
      </div>
    );
  }

  // O ID vem do POST /api/leads/[id]/simulacao (que gera, registra na
  // timeline e retorna pra UI). Se faltar (acesso direto à URL ou
  // retrocompat), gera um aqui — sem registrar interação, pra evitar
  // dupla contagem ou eventos zumbi.
  const sidParam = asString(sp.sid);
  const simulationId = isValidSimulationId(sidParam)
    ? sidParam
    : generateSimulationId();

  const result = buildSimulationResult(parsed.data, { simulationId });

  return <SimulacaoRenderer result={result} leadId={id} />;
}
