import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { leads as leadsTable } from "../../../../../../db/schema";
import { PropostaRenderer } from "@/components/leads/proposta-renderer";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getSimulacaoConfig } from "@/lib/simulador/config";
import { buildProposta } from "@/lib/simulador/faixa";
import {
  generateSimulationId,
  isValidSimulationId,
} from "@/lib/simulador/simulation-id";

// Página standalone (route group `(print)`) da PROPOSTA EM FAIXA — aberta em
// nova aba pelo card de 1 clique no detalhe do lead. As FAIXAS de taxa vêm da
// config do admin (server-side); a URL só carrega valores/modalidade — o
// consultor não escolhe taxa.

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

export default async function PropostaPage({ params, searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;

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

  const creditAmount =
    asNumber(sp.credito) ||
    (row.valorCreditoCentavos ? Math.round(row.valorCreditoCentavos / 100) : 0);
  const propertyValue =
    asNumber(sp.imovel) ||
    (row.valorImovelCentavos ? Math.round(row.valorImovelCentavos / 100) : 0);

  if (!(creditAmount > 0)) {
    return (
      <div className="max-w-xl mx-auto p-8 text-sm text-gray-700 space-y-3">
        <h1 className="text-lg font-semibold text-gray-900">
          Não foi possível gerar a proposta
        </h1>
        <p className="text-gray-600">
          O lead não tem valor de crédito informado. Volte pra ficha do lead e
          preencha o valor no card de proposta.
        </p>
      </div>
    );
  }

  const sidParam = asString(sp.sid);
  const simulationId = isValidSimulationId(sidParam)
    ? sidParam
    : generateSimulationId();

  const config = await getSimulacaoConfig();
  const result = buildProposta(
    {
      clientName: asString(sp.nome) || row.nome,
      clientCPF: asString(sp.cpf) || row.cpf || "",
      creditAmount,
      propertyValue,
      indexation: asString(sp.idx) === "pre" ? "pre" : "pos",
      tipoPessoa: row.tipoPessoa,
    },
    config,
    { simulationId },
  );

  return <PropostaRenderer result={result} leadId={id} />;
}
