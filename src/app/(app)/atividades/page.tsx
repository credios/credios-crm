import { redirect } from "next/navigation";

import { AtividadesPageClient } from "@/components/atividades/atividades-page-client";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { atividadesFiltersSchema } from "@/lib/atividades/filters";
import { computeKpis, listAtividades } from "@/lib/atividades/query";
import { listConsultoresAtivos } from "@/lib/leads/list-leads";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AtividadesPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!checkPermission(user, "admin.view_activities")) {
    redirect("/sem-permissao");
  }

  // Parse de filtros via Zod — defaults preenchidos pelo schema
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && v.length > 0) flat[k] = v[0]!;
  }
  const filters = atividadesFiltersSchema.parse(flat);

  // Buscas em paralelo: atividades + lista de consultores (pra dropdown)
  const [atividades, consultores] = await Promise.all([
    listAtividades(filters),
    listConsultoresAtivos().catch(() => []),
  ]);
  const kpis = computeKpis(atividades);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
          Atividades dos consultores
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Histórico cronológico de contatos e anotações por consultor. Acesso
          restrito a admin e gerente.
        </p>
      </div>

      <AtividadesPageClient
        initialAtividades={atividades}
        initialKpis={kpis}
        consultores={consultores}
        filters={filters}
      />
    </div>
  );
}
