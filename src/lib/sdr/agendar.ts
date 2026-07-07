import { and, desc, eq } from "drizzle-orm";

import { interacoes, reunioes, users as usersTable } from "../../../db/schema";
import {
  atualizarHorarioEvento,
  criarEvento,
  deletarEvento,
  moverEvento,
} from "@/lib/calendar/google";
import { db } from "@/lib/db";

const TZ = "America/Sao_Paulo";
const fmtData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function rotulo(d: Date): string {
  const p = fmtData.formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("weekday")}, ${g("day")}/${g("month")} às ${g("hour")}:${g("minute")}`;
}

const DESCRICAO_REUNIAO =
  "Conversa rápida (10–15 min): conhecer o cliente, entender a necessidade, " +
  "explicar como a Credios trabalha e iniciar a busca pelo crédito com garantia de imóvel.";

export type DadosAgendamento = {
  leadId: string;
  leadNome: string;
  consultorId: string;
  consultorEmail: string;
  clienteEmail?: string | null;
  inicioISO: string;
  fimISO: string;
};

export type ReuniaoAgendada = {
  reuniaoId: string;
  meetLink: string | null;
  eventId: string;
  rotulo: string; // "terça-feira, 01/07 às 14:00" (BRT)
};

/**
 * Cria o evento no Google Calendar do consultor (com Meet), grava a reunião e
 * registra na timeline do lead. Retorna os dados pra a Heloísa confirmar.
 */
export async function agendarReuniao(d: DadosAgendamento): Promise<ReuniaoAgendada> {
  const primeiroNome = d.leadNome.split(/\s+/)[0] ?? d.leadNome;
  const ev = await criarEvento({
    subject: d.consultorEmail,
    titulo: `Credios — conversa com ${primeiroNome}`,
    descricao: DESCRICAO_REUNIAO,
    inicioISO: d.inicioISO,
    fimISO: d.fimISO,
    convidados: d.clienteEmail ? [d.clienteEmail] : [],
  });

  const rot = rotulo(new Date(d.inicioISO));
  const [r] = await db
    .insert(reunioes)
    .values({
      leadId: d.leadId,
      consultorId: d.consultorId,
      googleEventId: ev.eventId,
      meetLink: ev.meetLink,
      inicio: new Date(d.inicioISO),
      fim: new Date(d.fimISO),
      status: "agendada",
    })
    .returning({ id: reunioes.id });

  await db.insert(interacoes).values({
    leadId: d.leadId,
    autorId: null,
    tipo: "reuniao",
    conteudo: `📅 Reunião por vídeo agendada — ${rot}${ev.meetLink ? ` · ${ev.meetLink}` : ""}`,
    metadata: {
      canal: "whatsapp_ia",
      reuniaoId: r!.id,
      eventId: ev.eventId,
      consultorId: d.consultorId,
    } as never,
  });

  return { reuniaoId: r!.id, meetLink: ev.meetLink, eventId: ev.eventId, rotulo: rot };
}

export type ReuniaoAtiva = {
  reuniaoId: string;
  consultorId: string | null;
  consultorEmail: string | null;
  consultorNome: string | null;
  inicio: Date;
  rotulo: string;
};

/** Reunião FUTURA ainda 'agendada' do lead (pra remarcar/cancelar). Null se não houver. */
export async function reuniaoAtivaDoLead(leadId: string): Promise<ReuniaoAtiva | null> {
  const [r] = await db
    .select({
      id: reunioes.id,
      consultorId: reunioes.consultorId,
      inicio: reunioes.inicio,
      email: usersTable.email,
      nome: usersTable.nome,
    })
    .from(reunioes)
    .leftJoin(usersTable, eq(usersTable.id, reunioes.consultorId))
    .where(and(eq(reunioes.leadId, leadId), eq(reunioes.status, "agendada")))
    .orderBy(desc(reunioes.inicio))
    .limit(1);
  if (!r || r.inicio.getTime() < Date.now()) return null;
  return {
    reuniaoId: r.id,
    consultorId: r.consultorId,
    consultorEmail: r.email,
    consultorNome: r.nome,
    inicio: r.inicio,
    rotulo: rotulo(r.inicio),
  };
}

export type ReuniaoRemarcada = { meetLink: string | null; rotulo: string };

/**
 * Move uma reunião agendada pra novo horário: atualiza o evento no Google (PATCH,
 * mantém o Meet), o registro em `reunioes` e a timeline. Retorna o novo rótulo +
 * link pra a Heloísa confirmar.
 */
export async function remarcarReuniao(
  reuniaoId: string,
  inicioISO: string,
  fimISO: string,
): Promise<ReuniaoRemarcada> {
  const [r] = await db
    .select({
      eventId: reunioes.googleEventId,
      consultorId: reunioes.consultorId,
      leadId: reunioes.leadId,
      meetLink: reunioes.meetLink,
    })
    .from(reunioes)
    .where(eq(reunioes.id, reuniaoId))
    .limit(1);
  if (!r) throw new Error("reunião não encontrada");

  const [u] = r.consultorId
    ? await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, r.consultorId))
        .limit(1)
    : [undefined];
  if (r.eventId && u?.email) {
    await atualizarHorarioEvento(u.email, r.eventId, inicioISO, fimISO);
  }

  const rot = rotulo(new Date(inicioISO));
  await db
    .update(reunioes)
    .set({ inicio: new Date(inicioISO), fim: new Date(fimISO), status: "agendada", updatedAt: new Date() })
    .where(eq(reunioes.id, reuniaoId));

  await db.insert(interacoes).values({
    leadId: r.leadId,
    autorId: null,
    tipo: "reuniao",
    conteudo: `📅 Reunião remarcada — ${rot}${r.meetLink ? ` · ${r.meetLink}` : ""}`,
    metadata: { canal: "whatsapp_ia", reuniaoId, remarcada: true, consultorId: r.consultorId } as never,
  });

  return { meetLink: r.meetLink, rotulo: rot };
}

export type ReuniaoTransferida = {
  reuniaoId: string;
  rotulo: string;
  meetLink: string | null;
  futura: boolean;
};

/**
 * Lead reatribuído → as reuniões ainda ABERTAS (status 'agendada') passam pro
 * novo consultor: o card de desfecho cai na Mesa DELE, e as reuniões FUTURAS
 * são movidas pra agenda Google dele (mesmo Meet, convidados notificados). A
 * reunião pertence ao lead — quem herda o lead herda a reunião.
 * Best-effort no Google: se o move falhar, a transferência no CRM acontece
 * mesmo assim (o desfecho é o que não pode se perder).
 */
export async function transferirReunioesDoLead(
  leadId: string,
  novoConsultor: { id: string; email: string; nome: string },
): Promise<ReuniaoTransferida[]> {
  const abertas = await db
    .select({
      id: reunioes.id,
      consultorId: reunioes.consultorId,
      eventId: reunioes.googleEventId,
      meetLink: reunioes.meetLink,
      inicio: reunioes.inicio,
    })
    .from(reunioes)
    .where(and(eq(reunioes.leadId, leadId), eq(reunioes.status, "agendada")));

  const transferidas: ReuniaoTransferida[] = [];
  for (const r of abertas) {
    if (r.consultorId === novoConsultor.id) continue;

    const [anterior] = r.consultorId
      ? await db
          .select({ email: usersTable.email, nome: usersTable.nome })
          .from(usersTable)
          .where(eq(usersTable.id, r.consultorId))
          .limit(1)
      : [undefined];

    const futura = r.inicio.getTime() > Date.now();
    // Reunião futura → move o evento pra agenda do novo consultor (mesmo Meet).
    if (futura && r.eventId && anterior?.email) {
      await moverEvento(anterior.email, r.eventId, novoConsultor.email).catch((e) =>
        console.error(`[reuniao] mover evento ${r.eventId} falhou (segue só no CRM):`, e),
      );
    }

    await db
      .update(reunioes)
      .set({ consultorId: novoConsultor.id, updatedAt: new Date() })
      .where(eq(reunioes.id, r.id));

    await db.insert(interacoes).values({
      leadId,
      autorId: null,
      tipo: "evento_sistema",
      conteudo: `Reunião (${rotulo(r.inicio)}) transferida de ${anterior?.nome ?? "?"} para ${novoConsultor.nome} junto com o lead.`,
      metadata: {
        reuniaoId: r.id,
        transferencia: true,
        de: r.consultorId,
        para: novoConsultor.id,
      } as never,
    });

    transferidas.push({
      reuniaoId: r.id,
      rotulo: rotulo(r.inicio),
      meetLink: r.meetLink,
      futura,
    });
  }
  return transferidas;
}

/** Cancela uma reunião agendada (remove do Google + marca status). */
export async function cancelarReuniao(reuniaoId: string): Promise<void> {
  const [r] = await db
    .select({
      eventId: reunioes.googleEventId,
      consultorId: reunioes.consultorId,
    })
    .from(reunioes)
    .where(eq(reunioes.id, reuniaoId))
    .limit(1);
  if (!r) return;
  // precisa do e-mail do consultor pra cancelar no Google — busca em users
  const [u] = r.consultorId
    ? await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, r.consultorId))
        .limit(1)
    : [undefined];
  if (r.eventId && u?.email) {
    await deletarEvento(u.email, r.eventId).catch(() => {});
  }
  await db
    .update(reunioes)
    .set({ status: "cancelada", updatedAt: new Date() })
    .where(eq(reunioes.id, reuniaoId));
}
