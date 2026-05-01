import "server-only";

import { eq } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";

import { users as usersTable } from "../../../db/schema";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

import type { Perfil } from "./types";

export type { Perfil };

export type AppUser = {
  id: string;
  email: string;
  nome: string;
  perfil: Perfil;
  ativo: boolean;
  whatsapp: string | null;
  authUser: User;
};

/**
 * Resolve o usuário autenticado e enriquece com a row de public.users.
 * Retorna null se não houver sessão. Lança se houver sessão mas sem row em
 * public.users (estado inconsistente — provisionamento do trigger ou seed faltou).
 */
export async function getAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    nome: row.nome,
    perfil: row.perfil,
    ativo: row.ativo,
    whatsapp: row.whatsapp,
    authUser: user,
  };
}
