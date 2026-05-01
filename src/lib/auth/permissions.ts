import type { AppUser } from "./get-app-user";
import type { Perfil } from "./types";

export function isAdmin(user: { perfil: Perfil } | null): boolean {
  return user?.perfil === "admin";
}

export function isAdminOrGerente(user: { perfil: Perfil } | null): boolean {
  return user?.perfil === "admin" || user?.perfil === "gerente";
}

export function canAccessConfiguracoes(user: AppUser | null): boolean {
  return isAdmin(user);
}

export function canAccessAudit(user: AppUser | null): boolean {
  return isAdmin(user);
}

/** Admin é obrigado a ter MFA TOTP enrolado (CLAUDE.md §6.1). */
export function shouldEnforceMfa(user: { perfil: Perfil } | null): boolean {
  return isAdmin(user);
}
