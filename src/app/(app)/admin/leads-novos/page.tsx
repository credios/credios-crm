import { Inbox } from "lucide-react";
import { redirect } from "next/navigation";

import { LeadsNovosBoard } from "@/components/leads-novos/leads-novos-board";
import { Badge } from "@/components/ui/badge";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { listLeadsNovosSemConsultor } from "@/lib/leads/list-leads-novos";
import { fetchConsultoresAtivos } from "@/lib/reports/queries";

// Página dynamic por auth (cookies). revalidate=60 cobre Data Cache de
// fetchConsultoresAtivos (já cacheada em queries.ts). A query principal
// (leads sem consultor) NÃO é cacheada — esta página é "tempo real" pra
// admin triagem; queremos ver leads novos chegando assim que entram.
export const revalidate = 60;
export const maxDuration = 30;

export default async function LeadsNovosPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/sem-permissao");

  const [leads, consultores] = await Promise.all([
    listLeadsNovosSemConsultor(),
    fetchConsultoresAtivos(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <Inbox
              className="size-6 text-primary"
              strokeWidth={1.75}
              aria-hidden
            />
            Leads novos
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Triagem do pool sem consultor · qualifique e atribua a um
            consultor, ou desqualifique.
          </p>
        </div>
        <Badge variant="soft">
          {leads.length} {leads.length === 1 ? "lead" : "leads"} pendente
          {leads.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <LeadsNovosBoard initial={leads} consultores={consultores} />
    </div>
  );
}
