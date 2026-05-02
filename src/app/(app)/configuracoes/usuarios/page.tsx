import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { type UserRow } from "@/components/configuracoes/user-edit-dialog";
import { UsuariosPageClient } from "@/components/configuracoes/usuarios-page-client";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import type { Perfil } from "@/lib/auth/types";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  whatsapp: string | null;
  createdAt: Date;
  lastSignInAt: Date | null;
  hasMfa: boolean;
};

export default async function ConfiguracoesUsuariosPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/sem-permissao");

  const rows = await db.execute<Row>(sql`
    SELECT
      u.id, u.nome, u.email, u.perfil, u.ativo, u.whatsapp,
      u.created_at AS "createdAt",
      a.last_sign_in_at AS "lastSignInAt",
      EXISTS(
        SELECT 1 FROM auth.mfa_factors
        WHERE user_id = u.id AND status = 'verified'
      ) AS "hasMfa"
    FROM public.users u
    LEFT JOIN auth.users a ON a.id = u.id
    ORDER BY u.ativo DESC, u.nome
  `);

  const users: UserRow[] = rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    email: r.email,
    perfil: r.perfil,
    ativo: r.ativo,
    hasMfa: r.hasMfa,
    lastSignInAt: r.lastSignInAt,
    createdAt: r.createdAt,
  })) as UserRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Convide novos membros, gerencie perfis e desative quem saiu.
        </p>
      </div>
      <UsuariosPageClient users={users} currentUserId={user.id} />
    </div>
  );
}
