import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ArrowLeft,
  Building2,
  Mail,
  MessageCircle,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  leads as leadsTable,
  parceiroInteracoes,
  parceiros,
  users as usersTable,
} from "../../../../../db/schema";
import {
  ParceiroAtribuir,
  ParceiroRegistrarContato,
  ParceiroStatusSelect,
} from "@/components/parceiros/parceiro-acoes";
import { ParceiroConvidarPortal } from "@/components/parceiros/parceiro-convidar-portal";
import { ParceiroEditar } from "@/components/parceiros/parceiro-editar";
import { ParceiroStatusBadge } from "@/components/parceiros/parceiro-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  PARCEIRO_INTERACAO_LABEL,
  PARCEIRO_ORIGEM_LABEL,
  PARCEIRO_SEGMENTO_LABEL,
  type ParceiroSegmento,
  type ParceiroStatus,
} from "@/lib/parceiros/constants";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function brl(centavos: number | null): string {
  if (!centavos) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(centavos / 100);
}

export default async function ParceiroDetalhePage({ params }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.perfil === "marketing") redirect("/sem-permissao");

  const { id } = await params;
  const [p] = await db.select().from(parceiros).where(eq(parceiros.id, id)).limit(1);
  if (!p) notFound();

  const admin = isAdminOrGerente(user);
  if (!admin && p.consultorId !== user.id) notFound();

  const [timeline, consultores, consultorAtual] = await Promise.all([
    db
      .select({
        id: parceiroInteracoes.id,
        tipo: parceiroInteracoes.tipo,
        conteudo: parceiroInteracoes.conteudo,
        criadoEm: parceiroInteracoes.criadoEm,
        autorNome: usersTable.nome,
      })
      .from(parceiroInteracoes)
      .leftJoin(usersTable, eq(usersTable.id, parceiroInteracoes.autorId))
      .where(eq(parceiroInteracoes.parceiroId, id))
      .orderBy(desc(parceiroInteracoes.criadoEm))
      .limit(50),
    admin
      ? db
          .select({ id: usersTable.id, nome: usersTable.nome })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.ativo, true),
              inArray(usersTable.perfil, ["admin", "gerente", "consultor"]),
            ),
          )
          .orderBy(usersTable.nome)
      : Promise.resolve([]),
    p.consultorId
      ? db
          .select({ nome: usersTable.nome })
          .from(usersTable)
          .where(eq(usersTable.id, p.consultorId))
          .limit(1)
          .then((r) => r[0]?.nome ?? null)
      : Promise.resolve(null),
  ]);

  // Produção do parceiro (leads indicados via portal) — só com vínculo.
  const producao = p.portalPartnerId
    ? await db
        .select({
          total: count(),
          ativos: count(
            sql`CASE WHEN ${leadsTable.status} NOT IN ('fechado','perdido','desqualificado','sem_resposta') THEN 1 END`,
          ),
          fechados: count(sql`CASE WHEN ${leadsTable.status} = 'fechado' THEN 1 END`),
          valorPipeline: sql<string>`COALESCE(SUM(CASE WHEN ${leadsTable.status} NOT IN ('fechado','perdido','desqualificado','sem_resposta') THEN ${leadsTable.valorCreditoCentavos} END), 0)`,
          valorLiberado: sql<string>`COALESCE(SUM(CASE WHEN ${leadsTable.status} = 'fechado' THEN ${leadsTable.valorLiberadoCentavos} END), 0)`,
        })
        .from(leadsTable)
        .where(eq(leadsTable.parceiroPortalId, p.portalPartnerId))
        .then((r) => r[0] ?? null)
    : null;

  const waDigits = p.whatsapp?.replace(/\D/g, "");

  return (
    <div className="space-y-6">
      <Link
        href="/parceiros"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Parceiros
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
              {p.nome}
            </h1>
            <ParceiroStatusBadge status={p.status as ParceiroStatus} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            {p.empresa && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3.5" /> {p.empresa}
              </span>
            )}
            <span>
              {p.segmento
                ? (PARCEIRO_SEGMENTO_LABEL[p.segmento as ParceiroSegmento] ?? p.segmento)
                : "Segmento não informado"}
            </span>
            {(p.cidade || p.estado) && (
              <span>{[p.cidade, p.estado].filter(Boolean).join("/")}</span>
            )}
            <span>· Origem: {PARCEIRO_ORIGEM_LABEL[p.origem as keyof typeof PARCEIRO_ORIGEM_LABEL] ?? p.origem}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {waDigits && (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
            >
              <MessageCircle className="size-4 text-emerald-600" /> WhatsApp
            </a>
          )}
          {p.email && (
            <a
              href={`mailto:${p.email}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
            >
              <Mail className="size-4" /> E-mail
            </a>
          )}
          <ParceiroStatusSelect parceiroId={p.id} status={p.status as ParceiroStatus} />
          {admin && (
            <ParceiroAtribuir
              parceiroId={p.id}
              consultorId={p.consultorId}
              consultores={consultores}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Coluna esquerda: dados + handoff + produção */}
        <div className="space-y-6 lg:col-span-3">
          <ParceiroEditar
            parceiro={{
              id: p.id,
              nome: p.nome,
              empresa: p.empresa,
              email: p.email,
              whatsapp: p.whatsapp,
              segmento: p.segmento,
              cidade: p.cidade,
              estado: p.estado,
              cpfCnpj: p.cpfCnpj,
              notas: p.notas,
            }}
            consultorNome={consultorAtual}
            motivoPerda={p.motivoPerda}
          />

          {admin && (
            <ParceiroConvidarPortal
              parceiro={{
                id: p.id,
                status: p.status,
                email: p.email,
                cpfCnpj: p.cpfCnpj,
                portalPartnerId: p.portalPartnerId,
                convidadoPortalEm: p.convidadoPortalEm?.toISOString() ?? null,
              }}
            />
          )}

          {producao && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="size-4 text-muted-foreground" />
                  Produção do parceiro
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{producao.total}</p>
                    <p className="text-xs text-muted-foreground">Indicações</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{producao.ativos}</p>
                    <p className="text-xs text-muted-foreground">No pipeline</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{producao.fechados}</p>
                    <p className="text-xs text-muted-foreground">Fechados</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">
                      {brl(Number(producao.valorLiberado))}
                    </p>
                    <p className="text-xs text-muted-foreground">Liberado</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Pipeline em aberto: {brl(Number(producao.valorPipeline))} · comissões e
                  contratos no portal de parceiros.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Coluna direita: registrar contato + timeline */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registrar contato</CardTitle>
            </CardHeader>
            <CardContent>
              <ParceiroRegistrarContato parceiroId={p.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem eventos ainda.</p>
              ) : (
                <ul className="space-y-3">
                  {timeline.map((ev) => (
                    <li key={ev.id} className="border-l-2 border-border pl-3">
                      <p className="text-xs text-muted-foreground">
                        {fmtDataHora.format(ev.criadoEm)} ·{" "}
                        {PARCEIRO_INTERACAO_LABEL[ev.tipo] ?? ev.tipo}
                        {ev.autorNome ? ` · ${ev.autorNome}` : ""}
                      </p>
                      {ev.conteudo && <p className="mt-0.5 text-sm">{ev.conteudo}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
