import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

import { users as usersTable } from "../../../../../db/schema";
import { LeadCreateForm } from "@/components/leads/lead-create-form";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export default async function NovoLeadPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!["admin", "gerente", "consultor"].includes(user.perfil)) {
    redirect("/sem-permissao");
  }

  let consultores: { id: string; nome: string }[] = [];
  if (isAdminOrGerente(user)) {
    consultores = await db
      .select({ id: usersTable.id, nome: usersTable.nome })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.ativo, true),
          inArray(usersTable.perfil, ["admin", "gerente", "consultor"]),
        ),
      )
      .orderBy(usersTable.nome);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo lead</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastro manual de lead. Para ingestão automática, use o webhook em{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            POST /api/webhooks/lead
          </code>
          .
        </p>
      </div>
      <LeadCreateForm currentUser={user} consultores={consultores} />
    </div>
  );
}
