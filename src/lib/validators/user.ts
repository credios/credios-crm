import { z } from "zod";

export const PERFIL_VALUES = ["admin", "gerente", "consultor", "marketing"] as const;

export const inviteUserSchema = z.object({
  email: z.string().email("Email inválido"),
  nome: z.string().trim().min(2, "Nome muito curto").max(100),
  perfil: z.enum(PERFIL_VALUES),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.object({
  nome: z.string().trim().min(2).max(100).optional(),
  perfil: z.enum(PERFIL_VALUES).optional(),
  ativo: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
