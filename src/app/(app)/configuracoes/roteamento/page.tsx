import { and, desc, eq, inArray } from "drizzle-orm";

import { regrasRoteamento, users as usersTable } from "../../../../../db/schema";
import { RulesPageClient } from "@/components/configuracoes/rules-page-client";
import { db } from "@/lib/db";
import type { RoutingRule } from "@/lib/routing/types";

export default async function RoteamentoPage() {
  // Auth gate via (app)/configuracoes/layout.tsx (admin only) já cobre.
  const [rules, usuarios] = await Promise.all([
    db
      .select()
      .from(regrasRoteamento)
      .orderBy(desc(regrasRoteamento.prioridade), regrasRoteamento.nome),
    db
      .select({
        id: usersTable.id,
        nome: usersTable.nome,
        email: usersTable.email,
        perfil: usersTable.perfil,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.ativo, true),
          inArray(usersTable.perfil, ["admin", "gerente", "consultor"]),
        ),
      )
      .orderBy(usersTable.nome),
  ]);

  const initialRules: RoutingRule[] = rules.map((r) => ({
    id: r.id,
    nome: r.nome,
    ativa: r.ativa,
    prioridade: r.prioridade,
    condicoes: (r.condicoes ?? {}) as RoutingRule["condicoes"],
    acao: r.acao,
    parametros: (r.parametros ?? null) as RoutingRule["parametros"],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Regras de roteamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define quem recebe leads conforme condições. Avaliadas em ordem de
          prioridade (top primeiro). Sem regra que bate, lead vai pro pool.
        </p>
      </div>
      <RulesPageClient initialRules={initialRules} usuarios={usuarios} />
    </div>
  );
}
