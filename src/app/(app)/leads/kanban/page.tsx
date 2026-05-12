import { redirect } from "next/navigation";

import { LeadKanban } from "@/components/leads/lead-kanban";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import {
  listConsultoresAtivos,
  listLeadsForKanban,
} from "@/lib/leads/list-leads";
import { listActiveStatuses } from "@/lib/status/queries";
import { listActiveSources } from "@/lib/tracking/resolver";
import { listLeadsQuerySchema } from "@/lib/validators/lead";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function KanbanPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");

  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && v.length > 0) flat[k] = v[0]!;
  }
  // Default sort do kanban: último contato ASC NULLS FIRST. Resultado:
  // leads sem contato (recém-chegados) e leads esquecidos (contato antigo)
  // bordam pra cima das colunas; leads contatados recentemente ficam embaixo.
  // Ajuda o consultor a focar primeiro no que pode estar sendo perdido.
  // URL pode sobrescrever (`?sortBy=criado_em&sortDir=desc` continua funcionando).
  if (!flat.sortBy) flat.sortBy = "ultimo_contato";
  if (!flat.sortDir) flat.sortDir = "asc";
  const filters = listLeadsQuerySchema.parse(flat);

  const [leads, consultores, sources, statuses] = await Promise.all([
    listLeadsForKanban(filters, user),
    listConsultoresAtivos(),
    listActiveSources(),
    listActiveStatuses(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline (Kanban)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arraste cards entre colunas pra mudar status. Drop em fechado,
          desqualificado ou perdido abre modal pra confirmação.
        </p>
      </div>
      <LeadKanban
        leads={leads}
        consultores={consultores}
        sources={sources}
        canCloseOrReopen={isAdmin(user)}
        statuses={statuses.map((s) => ({
          key: s.key,
          label: s.label,
          eTerminal: s.eTerminal,
        }))}
      />
    </div>
  );
}
