import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/configuracoes/usuarios",
    title: "Usuários",
    description: "Convidar, gerenciar perfis e desativar usuários",
  },
  {
    href: "/configuracoes/roteamento",
    title: "Regras de roteamento",
    description: "Definir quem recebe leads conforme condições",
  },
  {
    href: "/configuracoes/mensagens",
    title: "Templates de mensagens",
    description: "Editar o playbook de mensagens por status",
  },
];

export default function ConfiguracoesIndexPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Restrito a administradores.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition hover:border-foreground/30">
              <CardHeader>
                <CardTitle className="text-base">{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Em construção (Fase 4)
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
