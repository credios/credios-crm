"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { users as usersTable } from "../../../../db/schema";
import { logAudit } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import {
  newPasswordSchema,
  type NewPasswordInput,
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/validators/auth";

type Result = { ok: boolean; error?: string };

export async function updateProfileAction(input: UpdateProfileInput): Promise<Result> {
  const appUser = await getAppUser();
  if (!appUser) return { ok: false, error: "Não autenticado" };

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const whatsapp = parsed.data.whatsapp ? parsed.data.whatsapp : null;

  await db
    .update(usersTable)
    .set({ nome: parsed.data.nome, whatsapp })
    .where(eq(usersTable.id, appUser.id));

  void logAudit({
    usuarioId: appUser.id,
    acao: "perfil_editado",
    recursoTipo: "usuario",
    recursoId: appUser.id,
    metadata: { nome: parsed.data.nome, whatsapp },
  });

  revalidatePath("/perfil");
  return { ok: true };
}

export async function updatePasswordAction(input: NewPasswordInput): Promise<Result> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: error.message };

  void logAudit({
    usuarioId: user.id,
    acao: "senha_atualizada",
    recursoTipo: "sessao",
  });

  return { ok: true };
}

export async function disableMfaAction(factorId: string): Promise<Result> {
  const appUser = await getAppUser();
  if (!appUser) return { ok: false, error: "Não autenticado" };

  // Admin não pode desativar 2FA (CLAUDE.md §6.1).
  if (appUser.perfil === "admin") {
    return {
      ok: false,
      error: "Admins não podem desativar 2FA. Para trocar o fator, remova e cadastre novamente.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, error: error.message };

  void logAudit({
    usuarioId: appUser.id,
    acao: "mfa_desativado",
    recursoTipo: "sessao",
    metadata: { factorId },
  });

  revalidatePath("/perfil");
  return { ok: true };
}
