import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { Handshake, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { parceiros, users as usersTable } from "../../../../db/schema";
import { ParceiroStatusBadge } from "@/components/parceiros/parceiro-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  PARCEIRO_SEGMENTO_LABEL,
  PARCEIRO_STATUS,
  PARCEIRO_STATUS_LABEL,
  type ParceiroSegmento,
  type ParceiroStatus,
} from "@/lib/parceiros/constants";

export const dynamic = "force-dynamic";

// Módulo de Parceiros — LISTA simples, sem kanban (decisão do owner:
// pipeline B2B enxuto não justifica a complexidade). KPIs no topo +
// filtro por status via query param. Consultor vê só os seus.

type Props = { searchParams: Promise<{ status?: string }> };

function fmtData(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

export default async function ParceirosPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.perfil === "marketing") redirect("/sem-permissao");

  const { status: statusFiltro } = await searchParams;
  const admin = isAdminOrGerente(user);

  const escopo = admin ? undefined : eq(parceiros.consultorId, user.id);

  // KPIs (no escopo do usuário)
  const [kpis] = await db
    .select({
      triagem: count(sql`CASE WHEN ${parceiros.status} = 'novo' AND ${parceiros.consultorId} IS NULL THEN 1 END`),
      andamento: count(
        sql`CASE WHEN ${parceiros.status} IN ('novo','em_contato','reuniao','proposta_enviada','convidado_portal') THEN 1 END`,
      ),
      ativos: count(sql`CASE WHEN ${parceiros.status} = 'ativo' THEN 1 END`),
      perdidos90: count(
        sql`CASE WHEN ${parceiros.status} = 'perdido' AND ${parceiros.updatedAt} > now() - interval '90 days' THEN 1 END`,
      ),
    })
    .from(parceiros)
    .where(escopo);

  const filtroStatus =
    statusFiltro && (PARCEIRO_STATUS as readonly string[]).includes(statusFiltro)
      ? eq(parceiros.status, statusFiltro)
      : undefined;

  const lista = await db
    .select({
      id: parceiros.id,
      nome: parceiros.nome,
      empresa: parceiros.empresa,
      segmento: parceiros.segmento,
      cidade: parceiros.cidade,
      estado: parceiros.estado,
      status: parceiros.status,
      origem: parceiros.origem,
      ultimoContato: parceiros.ultimoContato,
      createdAt: parceiros.createdAt,
      consultorNome: usersTable.nome,
      semDono: isNull(parceiros.consultorId),
    })
    .from(parceiros)
    .leftJoin(usersTable, eq(usersTable.id, parceiros.consultorId))
    .where(and(escopo, filtroStatus))
    .orderBy(desc(parceiros.createdAt))
    .limit(200);

  const kpiCards = [
    { label: "Aguardando triagem", valor: kpis?.triagem ?? 0, href: "/parceiros?status=novo" },
    { label: "Em andamento", valor: kpis?.andamento ?? 0, href: "/parceiros" },
    { label: "Parceiros ativos", valor: kpis?.ativos ?? 0, href: "/parceiros?status=ativo" },
    { label: "Perdidos (90d)", valor: kpis?.perdidos90 ?? 0, href: "/parceiros?status=perdido" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <Handshake className="size-6 text-primary" strokeWidth={1.75} />
            Parceiros
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Do candidato à parceria ativa — contratos e comissões vivem no portal.
          </p>
        </div>
        <Link
          href="/parceiros/novo"
          className={buttonVariants({ size: "sm", className: "gap-1.5" })}
        >
          <Plus className="size-4" /> Novo parceiro
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <Link key={k.label} href={k.href}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="p-4">
                <p className="text-2xl font-semibold tabular-nums">{k.valor}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{k.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Filtro por status */}
      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/parceiros"
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            !statusFiltro
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40"
          }`}
        >
          Todos
        </Link>
        {PARCEIRO_STATUS.map((s) => (
          <Link
            key={s}
            href={`/parceiros?status=${s}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFiltro === s
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {PARCEIRO_STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {lista.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum parceiro {statusFiltro ? "neste status" : "ainda"}. Candidatos do
              site aparecem aqui automaticamente.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Nome</th>
                    <th className="px-4 py-2.5 font-medium">Segmento</th>
                    <th className="hidden px-4 py-2.5 font-medium md:table-cell">Cidade/UF</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Responsável</th>
                    <th className="hidden px-4 py-2.5 font-medium md:table-cell">Últ. contato</th>
                    <th className="px-4 py-2.5 font-medium">Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <Link href={`/parceiros/${p.id}`} className="font-medium hover:underline">
                          {p.nome}
                        </Link>
                        {p.empresa && (
                          <span className="block text-xs text-muted-foreground">{p.empresa}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {p.segmento
                          ? (PARCEIRO_SEGMENTO_LABEL[p.segmento as ParceiroSegmento] ?? p.segmento)
                          : "—"}
                      </td>
                      <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                        {[p.cidade, p.estado].filter(Boolean).join("/") || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <ParceiroStatusBadge status={p.status as ParceiroStatus} />
                      </td>
                      <td className="hidden px-4 py-2.5 lg:table-cell">
                        {p.semDono ? (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                            Triagem
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{p.consultorNome}</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                        {fmtData(p.ultimoContato)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtData(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
