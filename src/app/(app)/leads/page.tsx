import { redirect } from "next/navigation";

import { LeadList } from "@/components/leads/lead-list";
import { getAppUser } from "@/lib/auth/get-app-user";
import {
  listConsultoresAtivos,
  listLeads,
  listOrigensDistintas,
} from "@/lib/leads/list-leads";
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

  const [result, consultores, origens] = await Promise.all([
    listLeads(filters, user),
    listConsultoresAtivos(),
    listOrigensDistintas(),
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
      <LeadList result={result} consultores={consultores} origens={origens} />
    </div>
  );
}
