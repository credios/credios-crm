import { redirect } from "next/navigation";

import { LeadList } from "@/components/leads/lead-list";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import {
  listConsultoresAtivos,
  listLeads,
} from "@/lib/leads/list-leads";
import { listActiveSources } from "@/lib/tracking/resolver";
import { listLeadsQuerySchema } from "@/lib/validators/lead";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadsPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");

  const raw = await searchParams;
  // searchParams pode trazer string[] em params multivaluados — pegamos primeiro só.
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && v.length > 0) flat[k] = v[0]!;
  }
  const filters = listLeadsQuerySchema.parse(flat);

  // listLeads é crítico — sem ele a página não tem o que mostrar.
  // consultores/sources são pra dropdowns de filtro: se falharem, não
  // vale derrubar a página inteira. Isolamos com .catch().
  const [result, consultores, sources] = await Promise.all([
    listLeads(filters, user),
    listConsultoresAtivos().catch(() => []),
    listActiveSources().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.perfil === "consultor"
            ? "Você vê apenas leads atribuídos a você."
            : user.perfil === "marketing"
              ? "Dados pessoais mascarados conforme política LGPD."
              : "Acesso completo aos leads."}
        </p>
      </div>
      <LeadList
        result={result}
        consultores={consultores}
        sources={sources}
        isAdmin={isAdmin(user)}
      />
    </div>
  );
}
