import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

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
  /** Dados do JWT da sessão (não é o objeto completo do Supabase Auth). */
  authUser: {
    id: string;
    email: string | null;
    user_metadata: Record<string, unknown>;
  };
};

/**
 * Resolve o usuário autenticado e enriquece com a row de public.users.
 * Retorna null se não houver sessão. Lança se houver sessão mas sem row em
 * public.users (estado inconsistente — provisionamento do trigger ou seed faltou).
 */
export const getAppUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  // getClaims (era getUser): valida o JWT localmente quando o projeto usa
  // chaves assimétricas — sem ida ao Supabase Auth a cada página. Desativar
  // alguém continua imediato: a linha de public.users (ativo) é lida abaixo
  // em toda request e o layout barra quem está inativo.
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, claims.sub))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    nome: row.nome,
    perfil: row.perfil,
    ativo: row.ativo,
    whatsapp: row.whatsapp,
    authUser: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      user_metadata: (claims.user_metadata as Record<string, unknown>) ?? {},
    },
  };
});
