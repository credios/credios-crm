"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { users as usersTable } from "../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { db } from "@/lib/db";
import {
  firstAccessNomeSchema,
  type FirstAccessNomeInput,
} from "@/lib/validators/auth";

export async function updateNomeAction(
  input: FirstAccessNomeInput,
): Promise<{ ok: boolean; error?: string }> {
  const appUser = await getAppUser();
  if (!appUser) return { ok: false, error: "Não autenticado" };

  const parsed = firstAccessNomeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  await db
    .update(usersTable)
    .set({ nome: parsed.data.nome })
    .where(eq(usersTable.id, appUser.id));

  revalidatePath("/primeiro-acesso");
  return { ok: true };
}
