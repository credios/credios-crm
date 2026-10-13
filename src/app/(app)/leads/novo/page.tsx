import { and, eq, inArray, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { parceiros as parceirosTable, users as usersTable } from "../../../../../db/schema";
import { LeadCondominioCreateForm } from "@/components/leads/lead-condominio-create-form";
import { LeadCreateForm } from "@/components/leads/lead-create-form";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { PRODUTO_LABEL, PRODUTOS_ATIVOS, type Produto } from "@/lib/produtos";
import { listActiveSources } from "@/lib/tracking/resolver";
import { cn } from "@/lib/utils";

type Props = { searchParams: Promise<{ produto?: string }> };

export default async function NovoLeadPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!["admin", "gerente", "consultor"].includes(user.perfil)) {
    redirect("/sem-permissao");
  }

  let consultores: { id: string; nome: string }[] = [];
  if (isAdminOrGerente(user)) {
    consultores = await db
      .select({ id: usersTable.id, nome: usersTable.nome })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.ativo, true),
          inArray(usersTable.perfil, ["admin", "gerente", "consultor"]),
        ),
      )
      .orderBy(usersTable.nome);
  }

  // Sources ativos da tabela tracking_sources (substitui o enum ORIGENS).
  const sources = await listActiveSources();

  const { produto: produtoParam } = await searchParams;
  const produto: Produto = produtoParam === "CONDOMINIO" ? "CONDOMINIO" : "CGI";

  // Parceiros selecionáveis como indicador (só nome — a gestão é em /parceiros).
  const parceiros =
    produto === "CONDOMINIO"
      ? (
          await db
            .select({
              id: parceirosTable.id,
              nome: parceirosTable.nome,
              empresa: parceirosTable.empresa,
            })
            .from(parceirosTable)
            .where(
              and(
                ne(parceirosTable.status, "perdido"),
                sql`${parceirosTable.produtosHabilitados} @> ARRAY[${produto}]::text[]`,
              ),
            )
            .orderBy(parceirosTable.nome)
        ).map((p) => ({
          id: p.id,
          nome: p.empresa ? `${p.nome} (${p.empresa})` : p.nome,
        }))
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo lead</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastro manual de lead. Para ingestão automática, use o webhook em{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            POST /api/webhooks/lead
          </code>
          .
        </p>
      </div>
      <nav className="flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit" aria-label="Produto">
        {PRODUTOS_ATIVOS.map((p) => (
          <Link
            key={p}
            href={p === "CGI" ? "/leads/novo" : `/leads/novo?produto=${p}`}
            aria-current={p === produto ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              p === produto
                ? "bg-background font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {PRODUTO_LABEL[p]}
          </Link>
        ))}
      </nav>
      {produto === "CONDOMINIO" ? (
        <LeadCondominioCreateForm
          currentUser={user}
          consultores={consultores}
          sources={sources}
          parceiros={parceiros}
        />
      ) : (
        <LeadCreateForm
          currentUser={user}
          consultores={consultores}
          sources={sources}
        />
      )}
    </div>
  );
}
