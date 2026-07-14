import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import {
  duplicidadesPendentes,
  interacoes,
  leads as leadsTable,
  reunioes,
  scoreSolicitacoes,
  slaAlertas,
  users as usersTable,
} from "../../../db/schema";
import { db } from "@/lib/db";
import { endOfDayBrt, startOfDayBrt, todayYmdBrt } from "@/lib/datetime/brt";
import { listCadencias } from "@/lib/cadencia/config";
import { NAO_CONTATO_TIPOS } from "@/lib/leads/interacao-tipos";

// ============================================================================
// Tipos compartilhados
// ============================================================================

export type FilaItemTipo =
  | "reuniao_sem_desfecho"
  | "sla_estourado"
  | "docs_novos"
  | "cadencia"
  | "novo_hoje"
  | "negociacao_parada"
  | "alto_valor_parado";

/** Ação executável do card (cadência / desfecho de reunião). */
export type FilaAcao =
  | {
      tipo: "mensagem" | "ligacao" | "decisao";
      passoIdx: number;
      totalPassos: number;
      passoTitulo: string;
      energia: string | null;
      atrasoDias: number;
      /** Ligação com template anexo: "não atendeu" já dispara a mensagem. */
      temMensagem?: boolean;
    }
  | { tipo: "desfecho_reuniao"; reuniaoId: string; quando: string }
  | { tipo: "revisar_docs"; quantidade: number }
  | {
      /** Contato de 1 toque fora da cadência: todo card da fila tem uma ação
       *  concreta — nunca só um aviso. */
      tipo: "contato_direto";
      canal: "whatsapp" | "ligacao";
      instrucao: string;
      /** Mensagem pré-pronta pro wa.me (só chars BMP — emoji "novo" quebra
       *  no WhatsApp Desktop/Windows). */
      mensagem: string | null;
    };

export type FilaItem = {
  leadId: string;
  leadNome: string;
  whatsapp: string | null;
  status: string;
  origem: string | null;
  cidade: string | null;
  estado: string | null;
  valorCreditoCentavos: number | null;
  motivo: string;
  motivoTipo: FilaItemTipo;
  /** 0..100 — maior é mais urgente. */
  score: number;
  /** Presente quando o card tem ação de 1 toque (cadência / reunião). */
  acao?: FilaAcao;
};

const SCORE: Record<FilaItemTipo, number> = {
  reuniao_sem_desfecho: 100,
  sla_estourado: 98,
  docs_novos: 95, // cliente enviou docs e ninguém olhou — ponto de inflexão nº 2
  cadencia: 90, // +5 se atrasado (calculado no bucket)
  novo_hoje: 85,
  negociacao_parada: 75,
  alto_valor_parado: 60,
};

const ALTO_VALOR_CENTAVOS = 30_000_000; // R$ 300.000
const STATUS_TERMINAIS = ["fechado", "perdido", "desqualificado"];

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function brl(centavos: number | null): string | null {
  if (!centavos) return null;
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

// Mensagens default dos cards fora da cadência (1º contato / reativação /
// update). Sem emoji fora do BMP — pré-preenchidas via wa.me.
function msgPrimeiroContato(nome: string, valorCentavos: number | null): string {
  const v = brl(valorCentavos);
  return `Olá, ${primeiroNome(nome)}! Aqui é da Credios — sou o consultor responsável pela sua solicitação de crédito com garantia de imóvel${v ? ` de ${v}` : ""}. Posso te ligar rapidinho pra entender o seu caso e já acelerar a análise?`;
}

function msgUpdateNegociacao(nome: string): string {
  return `Oi, ${primeiroNome(nome)}! Passando pra te dar um retorno: a sua operação segue em análise e estou acompanhando de perto com os bancos. Qualquer novidade te aviso na hora. Precisa de algo enquanto isso?`;
}

function msgReativacao(nome: string, valorCentavos: number | null): string {
  const v = brl(valorCentavos);
  return `Oi, ${primeiroNome(nome)}! Não quero deixar o seu crédito${v ? ` de ${v}` : ""} parado. Me diz um horário bom hoje que eu te chamo e a gente define o próximo passo?`;
}

// ============================================================================
// FILA "FAZER AGORA" — leads priorizados por urgência
// ============================================================================

export async function getFilaFazerAgora(consultorId: string): Promise<FilaItem[]> {
  // Buckets em paralelo. Mesclamos no JS escolhendo o motivo de maior
  // prioridade por lead — evita o mesmo lead aparecer duas vezes.
  // docs_paradas e esfriando foram substituídos pela CADÊNCIA (playbook
  // executável): cada card já é uma ação pronta com data pra acontecer.
  const statusComCadencia = (await listCadencias())
    .filter((c) => c.ativa)
    .map((c) => c.statusKey);
  const [reunioesSemDesfecho, sla, docsNovos, cadencia, novosHoje, negociacaoParada, altoValorParado] =
    await Promise.all([
      qReuniaoSemDesfecho(consultorId),
      qSlaEstourado(consultorId),
      qDocsNovos(consultorId),
      qCadenciaDue(consultorId),
      qNovosHoje(consultorId),
      qNegociacaoParada(consultorId),
      qAltoValorParado(consultorId, statusComCadencia),
    ]);

  const todos: FilaItem[] = [
    ...reunioesSemDesfecho,
    ...sla,
    ...docsNovos,
    ...cadencia,
    ...novosHoje,
    ...negociacaoParada,
    ...altoValorParado,
  ];

  const byLead = new Map<string, FilaItem>();
  for (const item of todos) {
    const ex = byLead.get(item.leadId);
    if (!ex || item.score > ex.score) byLead.set(item.leadId, item);
  }

  return Array.from(byLead.values())
    .sort((a, b) => b.score - a.score || (b.valorCreditoCentavos ?? 0) - (a.valorCreditoCentavos ?? 0))
    .slice(0, 30);
}

async function qReuniaoSemDesfecho(consultorId: string): Promise<FilaItem[]> {
  // Reunião que já passou (30min de folga) e ninguém registrou o desfecho —
  // o loop do ponto de inflexão nº 1 precisa fechar SEMPRE.
  const rows = await db
    .select({
      reuniaoId: reunioes.id,
      inicio: reunioes.inicio,
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
    })
    .from(reunioes)
    .innerJoin(leadsTable, eq(leadsTable.id, reunioes.leadId))
    .where(
      and(
        eq(reunioes.consultorId, consultorId),
        eq(reunioes.status, "agendada"),
        lt(reunioes.inicio, sql`now() - interval '30 minutes'`),
        // Lead já encerrado (desqualificado/perdido/fechado) não volta pra Mesa
        // cobrando desfecho — a decisão sobre o lead já foi tomada.
        notInArray(leadsTable.status, STATUS_TERMINAIS),
        // Status mudou DEPOIS da reunião → ela obviamente aconteceu (o
        // endpoint de status já marca realizada; isto cobre dados antigos
        // e caminhos que não passam por lá).
        sql`not exists (
          select 1 from ${interacoes} i
          where i.lead_id = ${leadsTable.id}
            and i.tipo = 'mudanca_status'
            and i.criado_em > ${reunioes.inicio}
        )`,
      ),
    )
    .limit(10);
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return rows.map((r) => ({
    leadId: r.leadId,
    leadNome: r.leadNome,
    whatsapp: r.whatsapp,
    status: r.status,
    origem: r.origem,
    cidade: r.cidade,
    estado: r.estado,
    valorCreditoCentavos: r.valorCreditoCentavos,
    motivo: `Reunião de ${fmt.format(r.inicio)} sem desfecho — aconteceu?`,
    motivoTipo: "reuniao_sem_desfecho" as const,
    score: SCORE.reuniao_sem_desfecho,
    acao: {
      tipo: "desfecho_reuniao" as const,
      reuniaoId: r.reuniaoId,
      quando: fmt.format(r.inicio),
    },
  }));
}

async function qDocsNovos(consultorId: string): Promise<FilaItem[]> {
  // Cliente anexou documento(s) pelo portal e o consultor ainda não fez NADA
  // depois disso (nenhuma interação manual) → card cobrando revisão. Some
  // assim que o consultor age no lead (registrar contato, "Revisei", status…).
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      docsNovos: sql<number>`(
        select count(*)::int from ${interacoes} d
        where d.lead_id = ${leadsTable.id}
          and d.tipo = 'documento_recebido'
          and d.criado_em > coalesce((
            select max(i.criado_em) from ${interacoes} i
            where i.lead_id = ${leadsTable.id} and i.autor_id is not null
          ), '-infinity')
      )`,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        notInArray(leadsTable.status, STATUS_TERMINAIS),
        // Pré-filtro BARATO (índice parcial de documento_recebido): a imensa
        // maioria dos leads não tem doc nenhum e sai aqui sem tocar no max().
        sql`exists (
          select 1 from ${interacoes} d
          where d.lead_id = ${leadsTable.id}
            and d.tipo = 'documento_recebido'
        )`,
      ),
    )
    .limit(50);
  return rows
    .filter((r) => r.docsNovos > 0)
    .slice(0, 15)
    .map((r) => ({
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      valorCreditoCentavos: r.valorCreditoCentavos,
      motivo: `${r.docsNovos} documento${r.docsNovos > 1 ? "s" : ""} novo${r.docsNovos > 1 ? "s" : ""} no portal — revise e dê retorno`,
      motivoTipo: "docs_novos" as const,
      score: SCORE.docs_novos,
      acao: { tipo: "revisar_docs" as const, quantidade: r.docsNovos },
    }));
}

async function qCadenciaDue(consultorId: string): Promise<FilaItem[]> {
  // Passos da cadência vencendo HOJE (ou atrasados) — o coração da Mesa:
  // cada item já diz o que fazer, com que mensagem, e tem botão de 1 toque.
  const fimHoje = endOfDayBrt(todayYmdBrt());
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      cadenciaPasso: leadsTable.cadenciaPasso,
      cadenciaProximaEm: leadsTable.cadenciaProximaEm,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        notInArray(leadsTable.status, STATUS_TERMINAIS),
        sql`${leadsTable.cadenciaPasso} is not null`,
        lt(leadsTable.cadenciaProximaEm, fimHoje),
      ),
    )
    .limit(40);
  if (rows.length === 0) return [];
  const cadencias = await listCadencias();
  const out: FilaItem[] = [];
  for (const r of rows) {
    const cad = cadencias.find((c) => c.statusKey === r.status && c.ativa);
    const passo = cad?.passos[r.cadenciaPasso ?? -1];
    if (!cad || !passo) continue; // config mudou — some da fila, hook realinha
    const atrasoDias = r.cadenciaProximaEm
      ? Math.max(0, Math.floor((Date.now() - r.cadenciaProximaEm.getTime()) / 86_400_000))
      : 0;
    out.push({
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      valorCreditoCentavos: r.valorCreditoCentavos,
      motivo: `Passo ${(r.cadenciaPasso ?? 0) + 1}/${cad.passos.length} — ${passo.titulo}${atrasoDias > 0 ? ` · ${atrasoDias}d atrasado` : ""}`,
      motivoTipo: "cadencia" as const,
      score: SCORE.cadencia + (atrasoDias > 0 ? 5 : 0),
      acao: {
        tipo: passo.tipo,
        temMensagem: passo.tipo === "ligacao" && !!passo.templateId,
        passoIdx: r.cadenciaPasso ?? 0,
        totalPassos: cad.passos.length,
        passoTitulo: passo.titulo,
        energia: passo.energia,
        atrasoDias,
      },
    });
  }
  return out;
}

async function qSlaEstourado(consultorId: string): Promise<FilaItem[]> {
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(slaAlertas)
    .innerJoin(leadsTable, eq(leadsTable.id, slaAlertas.leadId))
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        eq(slaAlertas.tipo, "primeiro_contato_atrasado"),
        isNull(slaAlertas.resolvidoEm),
        // SLA de 1º contato só faz sentido em 'novo' — lead encerrado (ou que
        // já avançou de estágio) não pode cobrar 1º contato na Mesa.
        eq(leadsTable.status, "novo"),
      ),
    )
    .limit(20);
  return rows.map((r) => {
    const min = r.atribuidoEm
      ? Math.round((Date.now() - r.atribuidoEm.getTime()) / 60_000)
      : null;
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      valorCreditoCentavos: r.valorCreditoCentavos,
      motivo:
        min != null
          ? `SLA estourado · sem 1º contato há ${formatTempoDecorrido(min)}`
          : "SLA estourado · sem 1º contato",
      motivoTipo: "sla_estourado",
      score: SCORE.sla_estourado,
      acao: {
        tipo: "contato_direto" as const,
        canal: "whatsapp" as const,
        instrucao: "Faça o 1º contato AGORA — apresente-se como o consultor do caso.",
        mensagem: msgPrimeiroContato(r.leadNome, r.valorCreditoCentavos),
      },
    };
  });
}

async function qNovosHoje(consultorId: string): Promise<FilaItem[]> {
  const inicioDia = startOfDayBrt(todayYmdBrt());
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        eq(leadsTable.status, "novo"),
        gte(leadsTable.atribuidoEm, inicioDia),
      ),
    )
    .orderBy(desc(leadsTable.atribuidoEm))
    .limit(30);
  return rows.map((r) => ({
    leadId: r.leadId,
    leadNome: r.leadNome,
    whatsapp: r.whatsapp,
    status: r.status,
    origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
    valorCreditoCentavos: r.valorCreditoCentavos,
    motivo: r.atribuidoEm
      ? `Novo · atribuído ${formatTempoDecorrido(Math.round((Date.now() - r.atribuidoEm.getTime()) / 60_000))} atrás`
      : "Novo · recebido hoje",
    motivoTipo: "novo_hoje",
    score: SCORE.novo_hoje,
    acao: {
      tipo: "contato_direto" as const,
      canal: "whatsapp" as const,
      instrucao: "Primeiro contato — quanto antes, maior a conversão.",
      mensagem: msgPrimeiroContato(r.leadNome, r.valorCreditoCentavos),
    },
  }));
}

async function qNegociacaoParada(consultorId: string): Promise<FilaItem[]> {
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      ultimoContato: leadsTable.ultimoContato,
      updatedAt: leadsTable.updatedAt,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        eq(leadsTable.status, "em_negociacao"),
        lt(leadsTable.updatedAt, sql`now() - interval '5 days'`),
      ),
    )
    .limit(20);
  return rows.map((r) => {
    const dias = Math.round(
      (Date.now() - r.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      valorCreditoCentavos: r.valorCreditoCentavos,
      motivo: `Em negociação parada há ${dias}d`,
      motivoTipo: "negociacao_parada",
      score: SCORE.negociacao_parada,
      acao: {
        tipo: "contato_direto" as const,
        canal: "ligacao" as const,
        instrucao: `Ligue com um update da negociação — cliente sem notícias há ${dias}d.`,
        mensagem: msgUpdateNegociacao(r.leadNome),
      },
    };
  });
}

async function qAltoValorParado(
  consultorId: string,
  statusComCadencia: string[],
): Promise<FilaItem[]> {
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      ultimoContato: leadsTable.ultimoContato,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        gte(leadsTable.valorCreditoCentavos, ALTO_VALOR_CENTAVOS),
        // Estágios com cadência ficam de fora: quem tem cadência ativa aparece
        // no card de cadência; quem não tem, na FAXINA. Duplicar aqui só
        // afogava a fila com cards antigos sem ação pronta.
        notInArray(leadsTable.status, [...STATUS_TERMINAIS, ...statusComCadencia]),
        or(
          and(
            isNull(leadsTable.ultimoContato),
            lt(leadsTable.atribuidoEm, sql`now() - interval '3 days'`),
          ),
          lt(leadsTable.ultimoContato, sql`now() - interval '3 days'`),
        ),
      ),
    )
    .limit(20);
  return rows.map((r) => {
    const valorMi = r.valorCreditoCentavos
      ? (r.valorCreditoCentavos / 100_000_000).toFixed(1)
      : "?";
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      valorCreditoCentavos: r.valorCreditoCentavos,
      motivo: `Alto valor parado (R$ ${valorMi} mi)`,
      motivoTipo: "alto_valor_parado",
      score: SCORE.alto_valor_parado,
      acao: {
        tipo: "contato_direto" as const,
        canal: "whatsapp" as const,
        instrucao: "Reative agora — operação de alto valor sem próximo passo marcado.",
        mensagem: msgReativacao(r.leadNome, r.valorCreditoCentavos),
      },
    };
  });
}

// ============================================================================
// NOVOS PARA MIM — leads atribuídos nas últimas 24h
// ============================================================================

export type NovoParaMim = {
  leadId: string;
  leadNome: string;
  valorCreditoCentavos: number | null;
  whatsapp: string | null;
  origem: string | null;
  cidade: string | null;
  estado: string | null;
  atribuidoEm: Date;
  /** Minutos desde a atribuição. */
  minutosDesdeAtribuicao: number;
  /** 0..100 — quanto do SLA de 30min já passou. >100 = estourado. */
  slaPercentDecorrido: number;
};

export async function getNovosParaMim(
  consultorId: string,
): Promise<NovoParaMim[]> {
  const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      whatsapp: leadsTable.whatsapp,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        eq(leadsTable.status, "novo"),
        gte(leadsTable.atribuidoEm, desde24h),
      ),
    )
    .orderBy(desc(leadsTable.atribuidoEm))
    .limit(20);

  return rows
    .filter((r): r is typeof r & { atribuidoEm: Date } => r.atribuidoEm != null)
    .map((r) => {
      const min = Math.round((Date.now() - r.atribuidoEm.getTime()) / 60_000);
      return {
        leadId: r.leadId,
        leadNome: r.leadNome,
        valorCreditoCentavos: r.valorCreditoCentavos,
        whatsapp: r.whatsapp,
        origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
        atribuidoEm: r.atribuidoEm,
        minutosDesdeAtribuicao: min,
        slaPercentDecorrido: Math.min(200, Math.round((min / 30) * 100)),
      };
    });
}

// ============================================================================
// CARTEIRA EM RISCO — leads com chance alta de esfriar
// ============================================================================

export type CarteiraEmRisco = {
  leadId: string;
  leadNome: string;
  valorCreditoCentavos: number | null;
  status: string;
  origem: string | null;
  cidade: string | null;
  estado: string | null;
  ultimoContato: Date | null;
  diasSemContato: number;
  motivo: string;
};

export async function getCarteiraEmRisco(
  consultorId: string,
): Promise<CarteiraEmRisco[]> {
  // Status ativos sem contato há 7+ dias. Limita 30.
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      ultimoContato: leadsTable.ultimoContato,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        notInArray(leadsTable.status, STATUS_TERMINAIS),
        or(
          isNull(leadsTable.ultimoContato),
          lt(leadsTable.ultimoContato, sql`now() - interval '7 days'`),
        ),
        // Não mostrar leads novos sem contato — eles vão pra "novos pra mim"
        sql`${leadsTable.status} != 'novo'`,
      ),
    )
    .orderBy(desc(leadsTable.valorCreditoCentavos))
    .limit(30);

  return rows.map((r) => {
    const ref = r.ultimoContato ?? r.atribuidoEm;
    const dias = ref
      ? Math.round((Date.now() - ref.getTime()) / (24 * 60 * 60 * 1000))
      : 999;
    let motivo: string;
    if (r.status === "aguardando_documentacao")
      motivo = `Aguardando docs · ${dias}d sem contato`;
    else if (r.status === "em_negociacao")
      motivo = `Negociação parada · ${dias}d`;
    else motivo = `${dias}d sem contato`;
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      valorCreditoCentavos: r.valorCreditoCentavos,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      ultimoContato: r.ultimoContato,
      diasSemContato: dias,
      motivo,
    };
  });
}

// ============================================================================
// MINI PLACAR DO DIA
// ============================================================================

export type MiniPlacar = {
  leadsNovosRecebidos24h: number;
  leadsContatadosHoje: number;
  slaPendente: number;
  pipelineAtivoCentavos: number;
};

export async function getMiniPlacar(consultorId: string): Promise<MiniPlacar> {
  const inicioDia = startOfDayBrt(todayYmdBrt());
  const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [[novos24hRow], [contatadosHojeRow], [slaRow], [pipelineRow]] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.consultorId, consultorId),
            gte(leadsTable.atribuidoEm, desde24h),
          ),
        ),
      db
        .select({
          count: sql<number>`count(distinct ${interacoes.leadId})::int`,
        })
        .from(interacoes)
        .where(
          and(
            eq(interacoes.autorId, consultorId),
            gte(interacoes.criadoEm, inicioDia),
            // Exclui eventos de sistema E acontecimentos da operação — só
            // contatos reais com o cliente contam como "contatado hoje".
            notInArray(interacoes.tipo, [...NAO_CONTATO_TIPOS]),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(slaAlertas)
        .innerJoin(leadsTable, eq(leadsTable.id, slaAlertas.leadId))
        .where(
          and(
            eq(leadsTable.consultorId, consultorId),
            eq(slaAlertas.tipo, "primeiro_contato_atrasado"),
            isNull(slaAlertas.resolvidoEm),
            eq(leadsTable.status, "novo"),
          ),
        ),
      db
        .select({
          valor: sql<string>`coalesce(sum(${leadsTable.valorCreditoCentavos}), 0)::text`,
        })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.consultorId, consultorId),
            notInArray(leadsTable.status, STATUS_TERMINAIS),
          ),
        ),
    ]);

  return {
    leadsNovosRecebidos24h: novos24hRow.count,
    leadsContatadosHoje: contatadosHojeRow.count,
    slaPendente: slaRow.count,
    pipelineAtivoCentavos: Number(pipelineRow.valor ?? 0),
  };
}


// ============================================================================
// FAXINA DO PIPELINE — leads antigos sem cadência: decidir em 1 toque
// ============================================================================

export type FaxinaItem = {
  leadId: string;
  leadNome: string;
  whatsapp: string | null;
  status: string;
  valorCreditoCentavos: number | null;
  diasParado: number;
  ultimaInteracao: string | null;
};

export type Faxina = {
  feitasHoje: number;
  quota: number;
  restantes: number;
  itens: FaxinaItem[];
};

const FAXINA_QUOTA_DIA = 20;

/**
 * Leads em status com cadência mas SEM cadência ativa (antigos, de antes do
 * playbook executável) e parados há 3+ dias. O consultor decide em 1 toque:
 * retomar cadência ou encerrar. Dosado em 20/dia pra não afogar a Mesa.
 */
export async function getFaxina(consultorId: string): Promise<Faxina> {
  const cadencias = await listCadencias();
  const statusComCadencia = cadencias.filter((c) => c.ativa).map((c) => c.statusKey);
  if (statusComCadencia.length === 0) {
    return { feitasHoje: 0, quota: FAXINA_QUOTA_DIA, restantes: 0, itens: [] };
  }
  const inicioDia = startOfDayBrt(todayYmdBrt());

  const [feitasRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interacoes)
    .where(
      and(
        eq(interacoes.autorId, consultorId),
        gte(interacoes.criadoEm, inicioDia),
        sql`(${interacoes.metadata} ->> 'faxina') = 'true'`,
      ),
    );
  const feitasHoje = feitasRow?.count ?? 0;
  const quotaRestante = Math.max(0, FAXINA_QUOTA_DIA - feitasHoje);

  const base = and(
    eq(leadsTable.consultorId, consultorId),
    notInArray(leadsTable.status, STATUS_TERMINAIS),
    inArray(leadsTable.status, statusComCadencia),
    sql`${leadsTable.cadenciaPasso} is null`,
    sql`coalesce(${leadsTable.ultimoContato}, ${leadsTable.atribuidoEm}, ${leadsTable.createdAt}) < now() - interval '3 days'`,
  );

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(base);
  const restantes = totalRow?.count ?? 0;

  if (quotaRestante === 0 || restantes === 0) {
    return { feitasHoje, quota: FAXINA_QUOTA_DIA, restantes, itens: [] };
  }

  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      ultimoContato: leadsTable.ultimoContato,
      atribuidoEm: leadsTable.atribuidoEm,
      createdAt: leadsTable.createdAt,
    })
    .from(leadsTable)
    .where(base)
    .orderBy(desc(leadsTable.valorCreditoCentavos))
    .limit(quotaRestante);

  const leadIds = rows.map((r) => r.leadId);
  // Última interação com conteúdo (1 linha de contexto pro card).
  const ultimas =
    leadIds.length > 0
      ? await db
          .select({
            leadId: interacoes.leadId,
            conteudo: interacoes.conteudo,
            criadoEm: interacoes.criadoEm,
          })
          .from(interacoes)
          .where(
            and(
              inArray(interacoes.leadId, leadIds),
              sql`${interacoes.conteudo} is not null`,
            ),
          )
          .orderBy(desc(interacoes.criadoEm))
          .limit(200)
      : [];
  const ultimaPorLead = new Map<string, string>();
  for (const u of ultimas) {
    if (!ultimaPorLead.has(u.leadId) && u.conteudo) {
      ultimaPorLead.set(u.leadId, u.conteudo.slice(0, 90));
    }
  }

  return {
    feitasHoje,
    quota: FAXINA_QUOTA_DIA,
    restantes,
    itens: rows.map((r) => {
      const ref = r.ultimoContato ?? r.atribuidoEm ?? r.createdAt;
      return {
        leadId: r.leadId,
        leadNome: r.leadNome,
        whatsapp: r.whatsapp,
        status: r.status,
        valorCreditoCentavos: r.valorCreditoCentavos,
        diasParado: Math.round((Date.now() - ref.getTime()) / 86_400_000),
        ultimaInteracao: ultimaPorLead.get(r.leadId) ?? null,
      };
    }),
  };
}

// ============================================================================
// helpers
// ============================================================================

function formatTempoDecorrido(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `${h}h${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// ─── Próximas reuniões ──────────────────────────────────────────────────────

export type ProximaReuniao = {
  reuniaoId: string;
  inicio: Date;
  meetLink: string | null;
  leadId: string;
  leadNome: string;
  leadStatus: string;
  valorCreditoCentavos: number | null;
  hoje: boolean;
};

/** TODAS as reuniões agendadas ainda por acontecer do consultor, na ordem em
 *  que vão acontecer — a agenda de compromissos da Mesa. (As que já passaram
 *  sem desfecho viram card de cobrança na fila, não entram aqui.) */
export async function getProximasReunioes(
  consultorId: string,
): Promise<ProximaReuniao[]> {
  const rows = await db
    .select({
      reuniaoId: reunioes.id,
      inicio: reunioes.inicio,
      meetLink: reunioes.meetLink,
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      leadStatus: leadsTable.status,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
    })
    .from(reunioes)
    .innerJoin(leadsTable, eq(leadsTable.id, reunioes.leadId))
    .where(
      and(
        eq(reunioes.consultorId, consultorId),
        eq(reunioes.status, "agendada"),
        gte(reunioes.inicio, sql`now()`),
        notInArray(leadsTable.status, STATUS_TERMINAIS),
      ),
    )
    .orderBy(asc(reunioes.inicio));

  const hojeYmd = todayYmdBrt();
  const ymdBrt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return rows.map((r) => ({ ...r, hoje: ymdBrt.format(r.inicio) === hojeYmd }));
}

// ─── Solicitações de score pendentes (fila de aprovação do ADMIN) ───────────

export type SolicitacaoScorePendente = {
  id: string;
  criadoEm: Date;
  solicitanteNome: string;
  leadId: string;
  leadNome: string;
  valorCreditoCentavos: number | null;
};

export async function getSolicitacoesScorePendentes(): Promise<
  SolicitacaoScorePendente[]
> {
  return db
    .select({
      id: scoreSolicitacoes.id,
      criadoEm: scoreSolicitacoes.criadoEm,
      solicitanteNome: usersTable.nome,
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
    })
    .from(scoreSolicitacoes)
    .innerJoin(leadsTable, eq(leadsTable.id, scoreSolicitacoes.leadId))
    .innerJoin(usersTable, eq(usersTable.id, scoreSolicitacoes.solicitadoPor))
    .where(eq(scoreSolicitacoes.status, "pendente"))
    .orderBy(asc(scoreSolicitacoes.criadoEm))
    .limit(20);
}

/** Contagem de duplicidades de CPF pendentes (aviso na Mesa do admin). */
export async function getDuplicidadesPendentesCount(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(duplicidadesPendentes)
    .where(isNull(duplicidadesPendentes.resolvidoEm));
  return Number(r?.n ?? 0);
}
