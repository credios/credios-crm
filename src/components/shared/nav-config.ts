import {
  Activity,
  ClipboardList,
  Crown,
  Flame,
  Inbox,
  KanbanSquare,
  PieChart,
  Settings,
  ShieldCheck,
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
      { href: "/tarefas", label: "Tarefas", icon: ClipboardList },
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

export const ROUTE_META: Record<string, SimpleNavMeta> = {
  "/minha-mesa": {
    title: "Minha mesa",
    description: "Fila priorizada do dia",
  },
  "/leads": { title: "Leads", description: "Lista de leads" },
  "/leads/kanban": {
    title: "Kanban",
    description: "Visualização kanban do pipeline",
  },
  "/meu-desempenho": {
    title: "Meu desempenho",
    description: "Métricas pessoais e pipeline",
  },
  "/tarefas": {
    title: "Tarefas",
    description: "Follow-ups e pendências do dia",
  },
  "/admin/leads-novos": {
    title: "Leads novos",
    description: "Triagem do pool sem consultor",
  },
  "/relatorios": { title: "Relatórios", description: "Visão consolidada" },
  "/atividades": {
    title: "Atividades",
    description: "Histórico de ações por consultor",
  },
  "/admin/painel-executivo": {
    title: "Painel executivo",
    description: "Visão estratégica · admin",
  },
  "/admin/consultores": {
    title: "Consultores",
    description: "Overview do pipeline por consultor · admin",
  },
  "/configuracoes": { title: "Configurações" },
  "/configuracoes/usuarios": { title: "Usuários" },
  "/configuracoes/roteamento": { title: "Regras de roteamento" },
  "/configuracoes/mensagens": { title: "Templates de mensagens" },
  "/audit": { title: "Auditoria", description: "Trilha de eventos do sistema" },
  "/perfil": { title: "Meu perfil" },
  "/sem-permissao": { title: "Sem permissão" },
};
