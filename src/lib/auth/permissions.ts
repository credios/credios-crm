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

// ============================================================================
// checkPermission — gate de ações no backend (API routes, server actions)
// ============================================================================

export type Action =
  | "lead.list"
  | "lead.read"
  | "lead.create"
  | "lead.update"
  | "lead.delete"
  | "lead.assign"
  | "lead.change_status"
  | "lead.close_or_reopen"
  | "lead.read_financial"
  | "interacao.create"
  | "lead_anotacao.create"
  | "lead_anotacao.update"
  | "lead_anotacao.delete"
  | "task.list"
  | "task.complete"
  | "lead_bank.manage"
  | "user.manage"
  | "config.manage"
  | "audit.read"
  | "admin.view_activities";

export type Resource =
  | { type: "lead"; consultorId?: string | null }
  | { type: "task"; consultorId?: string | null }
  | { type: "user"; targetUserId?: string }
  | { type: "config" }
  | { type: "audit" };

/**
 * Decide se `user` pode executar `action` opcionalmente sobre `resource`.
 * Uso típico em API routes:
 *
 *   if (!checkPermission(appUser, "lead.update", { type: "lead", consultorId: lead.consultorId })) {
 *     return NextResponse.json({ error: "forbidden" }, { status: 403 });
 *   }
 */
export function checkPermission(
  user: AppUser | null,
  action: Action,
  resource?: Resource,
): boolean {
  if (!user || !user.ativo) return false;
  const perfil = user.perfil;

  switch (action) {
    case "lead.list":
      // Qualquer authenticated lista; o filtro server-side aplica os scopes.
      return true;

    case "lead.read": {
      if (perfil === "admin" || perfil === "gerente" || perfil === "marketing") {
        return true;
      }
      if (perfil === "consultor") {
        if (resource?.type !== "lead") return false;
        return resource.consultorId === user.id;
      }
      return false;
    }

    case "lead.create":
      return perfil === "admin" || perfil === "gerente" || perfil === "consultor";

    case "lead.update":
    case "lead.change_status": {
      if (perfil === "admin" || perfil === "gerente") return true;
      if (perfil === "consultor") {
        if (resource?.type !== "lead") return false;
        return resource.consultorId === user.id;
      }
      return false;
    }

    // Fechamento de lead OU reabertura (transição que entra/sai do status
    // 'fechado'): admin only — só admin conhece valores de comissão por banco.
    case "lead.close_or_reopen":
      return perfil === "admin";

    // Exclusão hard de lead: admin only. Operação destrutiva e irreversível —
    // ON DELETE CASCADE remove interações, tarefas, alertas e duplicidades.
    case "lead.delete":
      return perfil === "admin";

    // Acesso a dados financeiros do fechamento (banco, valor liberado,
    // comissão recebida): admin only — receita da empresa.
    case "lead.read_financial":
      return perfil === "admin";

    case "lead.assign":
      return perfil === "admin" || perfil === "gerente";

    case "interacao.create": {
      if (perfil === "admin" || perfil === "gerente") return true;
      if (perfil === "consultor") {
        if (resource?.type !== "lead") return false;
        return resource.consultorId === user.id;
      }
      return false;
    }

    // Anotações do lead (lead_anotacoes): criar/editar = admin OU consultor
    // atribuído ao lead. Gerente NÃO edita (anotação é "do consultor", não
    // pertence à hierarquia de gestão). Marketing nunca.
    case "lead_anotacao.create":
    case "lead_anotacao.update": {
      if (perfil === "admin") return true;
      if (perfil === "consultor") {
        if (resource?.type !== "lead") return false;
        return resource.consultorId === user.id;
      }
      return false;
    }

    // Exclusão de anotação: admin ONLY (irreversível, mexe em registro
    // criado por outra pessoa). Confirm dialog na UI; audit log obrigatório.
    case "lead_anotacao.delete":
      return perfil === "admin";

    case "task.list":
      return perfil === "admin" || perfil === "gerente" || perfil === "consultor";

    case "task.complete": {
      if (perfil === "admin" || perfil === "gerente") return true;
      if (perfil === "consultor") {
        if (resource?.type !== "task") return false;
        return resource.consultorId === user.id;
      }
      return false;
    }

    case "lead_bank.manage": {
      if (perfil === "admin" || perfil === "gerente") return true;
      if (perfil === "consultor") {
        if (resource?.type !== "lead") return false;
        return resource.consultorId === user.id;
      }
      return false;
    }

    case "user.manage":
    case "config.manage":
    case "audit.read":
      return perfil === "admin";

    // Dashboard /atividades — histórico cronológico do que cada consultor
    // fez no período. Admin pra acompanhamento; gerente herda pra ter
    // visão da equipe no dia a dia.
    case "admin.view_activities":
      return perfil === "admin" || perfil === "gerente";
  }
}
