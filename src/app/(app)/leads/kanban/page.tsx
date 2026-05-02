import { redirect } from "next/navigation";

import { LeadKanban } from "@/components/leads/lead-kanban";
import { getAppUser } from "@/lib/auth/get-app-user";
import {
  listConsultoresAtivos,
  listLeadsForKanban,
  listOrigensDistintas,
} from "@/lib/leads/list-leads";
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
  const filters = listLeadsQuerySchema.parse(flat);

  const [leads, consultores, origens] = await Promise.all([
    listLeadsForKanban(filters, user),
    listConsultoresAtivos(),
    listOrigensDistintas(),
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
      <LeadKanban leads={leads} consultores={consultores} origens={origens} />
    </div>
  );
}
