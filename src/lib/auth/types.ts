export type Perfil = "admin" | "gerente" | "consultor" | "marketing";

export const PERFIL_LABEL: Record<Perfil, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  consultor: "Consultor",
  marketing: "Marketing",
};
