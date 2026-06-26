import { ArrowRight, Compass, MessageSquare, Route, Target, Users, Workflow } from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/configuracoes/usuarios",
    title: "Usuários",
    description:
      "Convidar novos consultores, mudar perfis, desativar ou excluir contas.",
    icon: Users,
  },
  {
    href: "/configuracoes/roteamento",
    title: "Regras de roteamento",
    description:
      "Distribuir leads automaticamente conforme valor, origem, UF e outras condições.",
    icon: Route,
  },
  {
    href: "/configuracoes/mensagens",
    title: "Templates de mensagens",
    description:
      "Editar o playbook que aparece dentro de cada lead, com variáveis e ordem.",
    icon: MessageSquare,
  },
  {
    href: "/configuracoes/status",
    title: "Status do funil",
    description:
      "Criar, renomear, reordenar ou desativar status. Lead em status removido cai no anterior.",
    icon: Workflow,
  },
  {
    href: "/configuracoes/tracking",
    title: "Tracking de origem",
    description:
      "Catálogo de fontes (channel × source), aliases e quarantine de leads com origem desconhecida.",
    icon: Compass,
  },
  {
    href: "/configuracoes/google-ads",
    title: "Conversões Google Ads",
    description:
      "Acompanhar as conversões offline enviadas ao Google Ads (qualificado e fechado), status de envio e falhas.",
    icon: Target,
  },
];

export default function ConfiguracoesIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          Configurações
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Restrito a administradores.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href} className="group/setting block">
              <Card className="h-full transition-all duration-base hover:shadow-elev-md hover:ring-foreground/15">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-primary dark:bg-blue-950/40">
                      <Icon className="size-4" strokeWidth={1.75} />
                    </div>
                    <ArrowRight
                      className="size-4 text-muted-foreground transition-all duration-fast group-hover/setting:translate-x-0.5 group-hover/setting:text-primary"
                      strokeWidth={1.75}
                    />
                  </div>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {s.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
