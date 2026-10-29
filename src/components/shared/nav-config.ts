import {
  Activity,
  Crown,
  Flame,
  Handshake,
  Inbox,
  KanbanSquare,
  PieChart,
  Settings,
  ShieldCheck,
  UserPlus,
  TrendingUp,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visível apenas pra admin. */
  adminOnly?: boolean;
  /** Oculto pra perfil 'consultor' (ex: relatórios gerenciais). */
  hideForConsultor?: boolean;
  /** Oculto pra perfil 'marketing' (ex: minha mesa, que assume operação). */
  hideForMarketing?: boolean;
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
      // Minha mesa é a home — fila priorizada do dia. Marketing não atende
      // leads, então não tem mesa.
      {
        href: "/minha-mesa",
        label: "Minha mesa",
        icon: Flame,
        hideForMarketing: true,
      },
      {
        href: "/admin/leads-novos",
        label: "Leads novos",
        icon: Inbox,
        adminOnly: true,
      },
      { href: "/leads", label: "Leads", icon: Users, exact: true },
      { href: "/leads/kanban", label: "Kanban", icon: KanbanSquare },
      // Sala de fechamento: leads em negociação, foco no contato diário.
      // Marketing não atende leads, então não vê.
      {
        href: "/negociacoes",
        label: "Em negociação",
        icon: Handshake,
        hideForMarketing: true,
      },
      // Módulo de parceiros: pipeline B2B (candidato → parceria ativa).
      {
        href: "/parceiros",
        label: "Parceiros",
        icon: UserPlus,
        hideForMarketing: true,
      },
      { href: "/meu-desempenho", label: "Meu desempenho", icon: TrendingUp },
    ],
  },
  {
    label: "Análise",
    items: [
      {
        href: "/relatorios",
        label: "Relatórios",
        icon: PieChart,
        hideForConsultor: true,
      },
      // Atividades: admin + gerente (esconde de consultor e marketing).
      // Mesma regra que `admin.view_activities` em permissions.ts.
      {
        href: "/atividades",
        label: "Atividades",
        icon: Activity,
        hideForConsultor: true,
        hideForMarketing: true,
      },
      {
        href: "/admin/painel-executivo",
        label: "Painel executivo",
        icon: Crown,
        adminOnly: true,
      },
      {
        href: "/admin/consultores",
        label: "Consultores",
        icon: Users,
        adminOnly: true,
      },
    ],
  },
  {
    label: "Administração",
    items: [
      {
        href: "/configuracoes",
        label: "Configurações",
        icon: Settings,
        adminOnly: true,
      },
      { href: "/audit", label: "Auditoria", icon: ShieldCheck, adminOnly: true },
    ],
  },
  {
    label: "Pessoal",
    items: [{ href: "/perfil", label: "Meu perfil", icon: User }],
  },
];

export type SimpleNavMeta = {
  title: string;
  description?: string;
};
