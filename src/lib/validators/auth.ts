import { z } from "zod";

export const emailPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
});
export type EmailPasswordInput = z.infer<typeof emailPasswordSchema>;

export const recoverPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});
export type RecoverPasswordInput = z.infer<typeof recoverPasswordSchema>;

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
    confirmPassword: z.string().min(8, "Confirme a senha"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

export const firstAccessNomeSchema = z.object({
  nome: z
    .string()
    .min(2, "Nome muito curto")
    .max(100, "Nome muito longo"),
});
export type FirstAccessNomeInput = z.infer<typeof firstAccessNomeSchema>;

export const totpCodeSchema = z.object({
  code: z
    .string()
    .length(6, "Código deve ter 6 dígitos")
    .regex(/^\d{6}$/, "Apenas números"),
});
export type TotpCodeInput = z.infer<typeof totpCodeSchema>;

export const updateProfileSchema = z.object({
  nome: z.string().min(2, "Nome muito curto").max(100),
  whatsapp: z
    .string()
    .regex(/^\+?\d{10,15}$/, "Use formato +55DDDNNNNNNNNN")
    .optional()
    .or(z.literal("")),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
