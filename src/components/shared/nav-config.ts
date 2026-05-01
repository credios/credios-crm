import {
  BarChart3,
  KanbanSquare,
  Settings,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Se true, ativa quando pathname === href (não startsWith). */
  exact?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Trabalho",
    items: [
      { href: "/leads", label: "Leads", icon: Users, exact: true },
      { href: "/leads/kanban", label: "Kanban", icon: KanbanSquare },
      { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    label: "Administração",
    items: [
      { href: "/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
      { href: "/audit", label: "Auditoria", icon: ShieldCheck, adminOnly: true },
    ],
  },
  {
    label: "Pessoal",
    items: [
      { href: "/perfil", label: "Meu perfil", icon: User },
    ],
  },
];

export type SimpleNavMeta = {
  title: string;
  description?: string;
};

export const ROUTE_META: Record<string, SimpleNavMeta> = {
  "/leads": { title: "Leads", description: "Lista de leads" },
  "/leads/kanban": { title: "Kanban", description: "Visualização kanban do pipeline" },
  "/relatorios": { title: "Relatórios", description: "Métricas e dashboards" },
  "/relatorios/google-ads": { title: "Auditoria Google Ads" },
  "/configuracoes": { title: "Configurações" },
  "/configuracoes/usuarios": { title: "Usuários" },
  "/configuracoes/roteamento": { title: "Regras de roteamento" },
  "/configuracoes/mensagens": { title: "Templates de mensagens" },
  "/audit": { title: "Auditoria", description: "Trilha de eventos do sistema" },
  "/perfil": { title: "Meu perfil" },
  "/sem-permissao": { title: "Sem permissão" },
};
