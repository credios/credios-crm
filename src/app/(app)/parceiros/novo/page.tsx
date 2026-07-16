import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

import { users as usersTable } from "../../../../../db/schema";
import { ParceiroForm } from "@/components/parceiros/parceiro-form";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NovoParceiroPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.perfil === "marketing") redirect("/sem-permissao");

  const admin = isAdminOrGerente(user);
  const consultores = admin
    ? await db
        .select({ id: usersTable.id, nome: usersTable.nome })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.ativo, true),
            inArray(usersTable.perfil, ["admin", "gerente", "consultor"]),
          ),
        )
        .orderBy(usersTable.nome)
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          Novo parceiro
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastro manual — candidatos do site entram sozinhos na triagem.
        </p>
      </div>
      <ParceiroForm consultores={consultores} isAdmin={admin} />
    </div>
  );
}
