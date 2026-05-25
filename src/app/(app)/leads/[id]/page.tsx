import { aliasedTable, and, desc, eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import {
  interacoes,
  leadAnotacoes,
  leadBancos,
  leads as leadsTable,
  mensagensTemplate,
  users as usersTable,
} from "../../../../../db/schema";
import { LeadBancosCard } from "@/components/leads/lead-bancos-card";
import { LeadDetailHeader } from "@/components/leads/lead-detail-header";
import {
  type LeadDetailData,
  LeadContatoCard,
  LeadOperacaoCard,
  LeadOrigemCard,
  LeadPessoaisCard,
} from "@/components/leads/lead-detail-sections";
import { LeadSimulacaoCard } from "@/components/leads/lead-simulacao-card";
import { LeadTimelineTabs } from "@/components/leads/lead-timeline-tabs";
import { MensagensSugeridas } from "@/components/leads/mensagens-sugeridas";
import { ValoresSuspeitosBanner } from "@/components/leads/valores-suspeitos-banner";
import {
  SkeletonLeadBancos,
  SkeletonTimeline,
} from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { getAppUser } from "@/lib/auth/get-app-user";
import { maskLeadForPerfil } from "@/lib/auth/mascaramento";
import { checkPermission, isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { listConsultoresAtivos } from "@/lib/leads/list-leads";
import type { ValoresSuspeitos } from "@/lib/leads/valores-suspeitos";
import { listActiveStatuses } from "@/lib/status/queries";

type Props = { params: Promise<{ id: string }> };

const TIMELINE_PAGE_SIZE = 30;

export default async function LeadDetailPage({ params }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");

  const { id } = await params;

  // Fetch crítico: o próprio lead. Tudo o resto fica em Suspense streamed
  // pra renderizar a ficha principal o mais rápido possível.
  const [row] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!row) notFound();

  if (
    !checkPermission(user, "lead.read", { type: "lead", consultorId: row.consultorId })
  ) {
    redirect("/sem-permissao");
  }

  const masked = maskLeadForPerfil(row, user.perfil);
  const isMarketing = user.perfil === "marketing";

  const lead: LeadDetailData = {
    id: row.id,
    nome: masked.nome,
    cpf: masked.cpf,
    estadoCivil: masked.estadoCivil,
    ocupacao: masked.ocupacao,
    rendaMensalCentavos: masked.rendaMensalCentavos,
    whatsapp: masked.whatsapp,
    email: masked.email,
    cidade: masked.cidade,
    estado: masked.estado,
    produto: masked.produto,
    objetivoCredito: masked.objetivoCredito,
    tipoImovel: masked.tipoImovel,
    tipoImovelDetalhes: masked.tipoImovelDetalhes,
    situacaoImovel: masked.situacaoImovel,
    tipoPessoa: masked.tipoPessoa,
    valorImovelCentavos: masked.valorImovelCentavos,
    saldoDevedorCentavos: masked.saldoDevedorCentavos,
    valorCreditoCentavos: masked.valorCreditoCentavos,
    bancoAprovador: masked.bancoAprovador ?? null,
    valorLiberadoCentavos: masked.valorLiberadoCentavos ?? null,
    comissaoCentavos: masked.comissaoCentavos ?? null,
    dataFechamento: masked.dataFechamento,
    channel: masked.channel ?? null,
    source: masked.source ?? null,
    paid: masked.paid ?? null,
    origem: masked.origem,
    utmSource: masked.utmSource,
    utmMedium: masked.utmMedium,
    utmCampaign: masked.utmCampaign,
    utmTerm: masked.utmTerm,
    utmContent: masked.utmContent,
    gclid: masked.gclid,
    rede: masked.rede,
    dispositivo: masked.dispositivo,
    palavraChave: masked.palavraChave,
    grupoAnuncios: masked.grupoAnuncios,
    criativo: masked.criativo,
    tipoCorrespondencia: masked.tipoCorrespondencia,
    referrer: masked.referrer,
    paginaEntrada: masked.paginaEntrada,
  };

  const canEdit = checkPermission(user, "lead.update", {
    type: "lead",
    consultorId: row.consultorId,
  });
  const canAssign = checkPermission(user, "lead.assign");
  const canCreateInteracao = checkPermission(user, "interacao.create", {
    type: "lead",
    consultorId: row.consultorId,
  });
  const canManageBank = checkPermission(user, "lead_bank.manage", {
    type: "lead",
    consultorId: row.consultorId,
  });
  const canEditAnotacao = checkPermission(user, "lead_anotacao.update", {
    type: "lead",
    consultorId: row.consultorId,
  });
  const canDeleteAnotacao = checkPermission(user, "lead_anotacao.delete");

  // Banner de valores suspeitos: só pra admin/gerente, só quando flag está
  // ativa e ainda não foi revisada. Some assim que admin decide (router.refresh).
  const mostrarValoresSuspeitos =
    isAdminOrGerente(user) &&
    row.valoresSuspeitos != null &&
    row.valoresRevisadoEm == null;

  return (
    <div className="space-y-6 animate-fade-in">
      {mostrarValoresSuspeitos && (
        <ValoresSuspeitosBanner
          leadId={lead.id}
          valoresSuspeitos={row.valoresSuspeitos as ValoresSuspeitos}
        />
      )}

      {/* Header — depende de statuses ativos. Streaming pra não bloquear. */}
      <Suspense fallback={<HeaderSkeleton />}>
        <HeaderBlock
          leadId={lead.id}
          nome={lead.nome}
          status={row.status}
          valorCreditoCentavos={lead.valorCreditoCentavos}
          whatsapp={lead.whatsapp}
          email={lead.email}
          consultorId={row.consultorId}
          canEdit={canEdit}
          canAssign={canAssign}
          isAdmin={user.perfil === "admin"}
        />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Coluna esquerda: cards principais (síncronos, baseados no `lead` já carregado).
            min-w-0 nos filhos do grid evita que conteúdo largo (GCLID, URL) empurre
            a coluna além da largura do viewport no mobile. */}
        <div className="min-w-0 space-y-6">
          <LeadPessoaisCard lead={lead} canEdit={canEdit} />
          <LeadContatoCard lead={lead} canEdit={canEdit} />
          <LeadOperacaoCard lead={lead} canEdit={canEdit} />

          {!isMarketing && (
            <Suspense fallback={<SkeletonLeadBancos />}>
              <BancosBlock leadId={lead.id} canEdit={canManageBank} />
            </Suspense>
          )}

          <LeadOrigemCard lead={lead} />

          {/* Card de simulação — só pra perfis que veem dados não-mascarados.
              Marketing vê CPF/valores mascarados, então a simulação seria
              inválida. Demais perfis (admin, gerente, consultor c/ acesso)
              podem gerar PDF a qualquer momento. */}
          {!isMarketing && (
            <LeadSimulacaoCard
              leadId={lead.id}
              defaults={{
                nome: lead.nome,
                cpf: lead.cpf,
                valorCreditoCentavos: lead.valorCreditoCentavos,
                valorImovelCentavos: lead.valorImovelCentavos,
              }}
            />
          )}

          <Suspense fallback={<MensagensSkeleton />}>
            <MensagensBlock
              leadStatus={row.status}
              leadNome={lead.nome}
              leadCidade={lead.cidade}
              leadEstado={lead.estado}
              leadValorCredito={lead.valorCreditoCentavos}
              leadValorImovel={lead.valorImovelCentavos}
              consultorId={row.consultorId}
              fallbackConsultor={user.nome}
            />
          </Suspense>
        </div>

        {/* Coluna direita: tabs Contatos + Anotações (carrega 1a página). */}
        <div className="min-w-0">
          {isMarketing ? (
            <TimelineRedacted />
          ) : (
            <Suspense fallback={<SkeletonTimeline items={4} />}>
              <TimelineBlock
                leadId={lead.id}
                canCreate={canCreateInteracao}
                canEditAnotacao={canEditAnotacao}
                canDeleteAnotacao={canDeleteAnotacao}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Suspense blocks — cada um carrega seu próprio dado em paralelo.
// Falha de um bloco mostra um fallback local (via try/catch dentro do bloco).
// ============================================================================

async function HeaderBlock(props: {
  leadId: string;
  nome: string;
  status: string;
  valorCreditoCentavos: number | null;
  whatsapp: string | null;
  email: string | null;
  consultorId: string | null;
  canEdit: boolean;
  canAssign: boolean;
  isAdmin: boolean;
}) {
  // Statuses + consultor + nome do consultor atribuído. Paralelo.
  const [statuses, consultores, consultorRow] = await Promise.all([
    listActiveStatuses().catch(() => []),
    listConsultoresAtivos().catch(() => []),
    props.consultorId
      ? db
          .select({ nome: usersTable.nome })
          .from(usersTable)
          .where(eq(usersTable.id, props.consultorId))
          .limit(1)
          .then((r) => r[0] ?? null)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <LeadDetailHeader
        lead={{
          id: props.leadId,
          nome: props.nome,
          status: props.status,
          valorCreditoCentavos: props.valorCreditoCentavos,
          whatsapp: props.whatsapp,
          email: props.email,
        }}
        canEdit={props.canEdit}
        canAssign={props.canAssign}
        isAdmin={props.isAdmin}
        consultores={consultores}
        statuses={statuses.map((s) => ({
          key: s.key,
          label: s.label,
          eTerminal: s.eTerminal,
        }))}
      />
      {props.consultorId && consultorRow && (
        <p className="text-sm text-muted-foreground mt-4">
          Atribuído a{" "}
          <span className="font-medium text-foreground">{consultorRow.nome}</span>
        </p>
      )}
    </>
  );
}

async function BancosBlock({
  leadId,
  canEdit,
}: {
  leadId: string;
  canEdit: boolean;
}) {
  // Isolar fetch do render: try/catch envolvendo JSX é um anti-pattern porque
  // erros de render são lazy. Aqui só capturamos falha do await.
  const rows = await db
    .select()
    .from(leadBancos)
    .where(eq(leadBancos.leadId, leadId))
    .orderBy(leadBancos.banco)
    .catch(() => null);

  if (rows === null) {
    return (
      <div className="surface-solid rounded-xl p-5 text-sm text-muted-foreground">
        Não foi possível carregar bancos parceiros agora. Recarregue a página.
      </div>
    );
  }

  return <LeadBancosCard leadId={leadId} rows={rows} canEdit={canEdit} />;
}

async function MensagensBlock(props: {
  leadStatus: string;
  leadNome: string;
  leadCidade: string | null;
  leadEstado: string | null;
  leadValorCredito: number | null;
  leadValorImovel: number | null;
  consultorId: string | null;
  fallbackConsultor: string;
}) {
  // .catch() em cada query: se uma falhar, mostramos fallback discreto sem
  // derrubar o bloco inteiro. Render fica fora de try/catch (anti-pattern).
  const [templatesRows, consultorRow] = await Promise.all([
    db
      .select()
      .from(mensagensTemplate)
      .where(
        and(
          eq(mensagensTemplate.ativa, true),
          sql`${mensagensTemplate.statusAplicavel} @> ARRAY[${props.leadStatus}]::text[]`,
        ),
      )
      .orderBy(mensagensTemplate.ordem)
      .catch(() => null),
    props.consultorId
      ? db
          .select({ nome: usersTable.nome })
          .from(usersTable)
          .where(eq(usersTable.id, props.consultorId))
          .limit(1)
          .then((r) => r[0] ?? null)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  if (templatesRows === null) {
    return (
      <div className="surface-solid rounded-xl p-5 text-sm text-muted-foreground">
        Mensagens sugeridas indisponíveis. Recarregue se precisar.
      </div>
    );
  }

  return (
    <MensagensSugeridas
      templates={templatesRows.map((t) => ({
        id: t.id,
        nome: t.nome,
        ordem: t.ordem,
        conteudo: t.conteudo,
        statusAplicavel: t.statusAplicavel,
      }))}
      lead={{
        nome: props.leadNome,
        cidade: props.leadCidade,
        estado: props.leadEstado,
        valorCreditoCentavos: props.leadValorCredito,
        valorImovelCentavos: props.leadValorImovel,
        consultor: consultorRow?.nome ?? props.fallbackConsultor,
      }}
      expandirPlaybook={
        props.leadStatus === "novo" ||
        props.leadStatus === "conversa_inicial" ||
        props.leadStatus === "aguardando_resposta"
      }
    />
  );
}

async function TimelineBlock({
  leadId,
  canCreate,
  canEditAnotacao,
  canDeleteAnotacao,
}: {
  leadId: string;
  canCreate: boolean;
  canEditAnotacao: boolean;
  canDeleteAnotacao: boolean;
}) {
  // Carrega Contatos (primeira página) + todas as anotações em paralelo.
  // Anotações não paginam (típico ter dezenas, não milhares; cap em 200 row
  // de defesa). Joins com users pra trazer nome do autor em ambas.
  const usersTableAlias = aliasedTable(usersTable, "u_anot");
  const [interacoesRows, anotacoesRows] = await Promise.all([
    db
      .select({
        id: interacoes.id,
        tipo: interacoes.tipo,
        conteudo: interacoes.conteudo,
        metadata: interacoes.metadata,
        criadoEm: interacoes.criadoEm,
        autorId: interacoes.autorId,
        autorNome: usersTable.nome,
      })
      .from(interacoes)
      .leftJoin(usersTable, eq(usersTable.id, interacoes.autorId))
      .where(eq(interacoes.leadId, leadId))
      .orderBy(desc(interacoes.criadoEm))
      .limit(TIMELINE_PAGE_SIZE)
      .catch(() => null),
    db
      .select({
        id: leadAnotacoes.id,
        titulo: leadAnotacoes.titulo,
        conteudo: leadAnotacoes.conteudo,
        autorId: leadAnotacoes.autorId,
        autorNome: usersTableAlias.nome,
        editadoEm: leadAnotacoes.editadoEm,
        editadoPor: leadAnotacoes.editadoPor,
        createdAt: leadAnotacoes.createdAt,
        updatedAt: leadAnotacoes.updatedAt,
      })
      .from(leadAnotacoes)
      .leftJoin(usersTableAlias, eq(usersTableAlias.id, leadAnotacoes.autorId))
      .where(eq(leadAnotacoes.leadId, leadId))
      .orderBy(desc(leadAnotacoes.createdAt))
      .limit(200)
      .catch(() => null),
  ]);

  if (interacoesRows === null) {
    return (
      <div className="surface-solid rounded-xl p-5 text-sm text-muted-foreground">
        Timeline indisponível agora. Recarregue a página.
      </div>
    );
  }

  const initialInteracoes = interacoesRows.map((i) => ({
    id: i.id,
    tipo: i.tipo,
    conteudo: i.conteudo,
    metadata: i.metadata,
    criadoEm: i.criadoEm.toISOString(),
    autorId: i.autorId,
    autorNome: i.autorNome,
  }));
  const mayHaveMoreInteracoes = initialInteracoes.length === TIMELINE_PAGE_SIZE;

  const initialAnotacoes = (anotacoesRows ?? []).map((a) => ({
    id: a.id,
    titulo: a.titulo,
    conteudo: a.conteudo,
    autorId: a.autorId,
    autorNome: a.autorNome,
    editadoEm: a.editadoEm?.toISOString() ?? null,
    editadoPor: a.editadoPor,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  return (
    <LeadTimelineTabs
      leadId={leadId}
      initialInteracoes={initialInteracoes}
      canCreateInteracao={canCreate}
      mayHaveMoreInteracoes={mayHaveMoreInteracoes}
      initialAnotacoes={initialAnotacoes}
      canEditAnotacao={canEditAnotacao}
      canDeleteAnotacao={canDeleteAnotacao}
    />
  );
}

// ============================================================================
// Skeletons locais (mais leves que importar tudo de skeletons.tsx).
// ============================================================================

function HeaderSkeleton() {
  return (
    <div className="surface-solid rounded-2xl p-6 space-y-3">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-7 w-40" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
  );
}

function MensagensSkeleton() {
  return (
    <div className="surface-solid rounded-xl p-5 space-y-3">
      <Skeleton className="h-5 w-44" />
      <Skeleton className="h-3 w-64" />
      <div className="space-y-2 pt-1">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

/**
 * Placeholder mostrado pra perfil 'marketing' no lugar da timeline. As
 * interações têm texto livre que pode conter PII (CPF, telefone, banco,
 * valores) que mascaramento de campos não cobre — bloqueio total é mais
 * seguro que regex de redação.
 */
function TimelineRedacted() {
  return (
    <div className="surface-solid rounded-xl p-6 text-center space-y-2">
      <p className="font-display text-base font-semibold">Timeline restrita</p>
      <p className="font-serif italic text-sm text-muted-foreground leading-relaxed">
        O histórico de interações pode conter dados sensíveis (CPF, telefone,
        valores bancários) e não está disponível pra perfil de marketing.
      </p>
      <p className="text-xs text-fg-subtle">
        Solicite ao admin se precisar de informação específica deste lead.
      </p>
    </div>
  );
}
