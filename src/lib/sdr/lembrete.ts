import "server-only";

import { and, desc, eq, gte, lte, notInArray } from "drizzle-orm";

import { interacoes, leads, reunioes, users as usersTable } from "../../../db/schema";
import { db } from "@/lib/db";
import {
  sendReuniaoLembreteConsultorEmail,
  sendReuniaoLembreteEmail,
} from "@/lib/notifications/email";
import { enviarTemplateWhatsApp, enviarTextoWhatsApp } from "@/lib/whatsapp/meta";

// Lembrete de reunião ~30 min antes. Disparado pelo cron a cada 10 min: pega
// reuniões 'agendada' começando na janela [now+25min, now+35min] que ainda não
// receberam lembrete. Dentro da janela de 24h do WhatsApp manda texto livre (de
// graça); fora dela, usa o template Utility aprovado.

const JANELA_MIN_MIN = 25;
const JANELA_MAX_MIN = 35;
const JANELA_24H_MS = 24 * 60 * 60 * 1000;
const LOTE = 50;

// Template Utility aprovado no Meta. Cria/submete pelo Gerenciador do WhatsApp;
// configurável por env (default abaixo). Variáveis: {{1}}=primeiro nome,
// {{2}}=quando (ex.: "hoje às 15:00").
const TEMPLATE_LEMBRETE = process.env.WHATSAPP_TEMPLATE_LEMBRETE ?? "lembrete_reuniao";
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LEMBRETE_LANG ?? "pt_BR";

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Reuniões 08–18h BRT → o lembrete (25–35 min antes) cai sempre no mesmo dia. */
function quandoLabel(inicio: Date): string {
  return `hoje às ${fmtHora.format(inicio)}`;
}

function msgTextoLivre(nome: string, quando: string, meetLink: string | null): string {
  const saud = nome ? `Oi, ${nome}!` : "Oi!";
  const link = meetLink ? `\n\nÉ só entrar por aqui na hora: ${meetLink}` : "";
  return `${saud} 👋 Passando pra lembrar da sua conversa por vídeo com a Credios ${quando} — é rapidinho, de 10 a 15 minutos.${link}\n\nAté já! 🙂`;
}

/** Janela de 24h aberta = cliente mandou mensagem nas últimas 24h. */
async function janela24hAberta(leadId: string): Promise<boolean> {
  const [ult] = await db
    .select({ criadoEm: interacoes.criadoEm })
    .from(interacoes)
    .where(and(eq(interacoes.leadId, leadId), eq(interacoes.tipo, "whatsapp_recebido")))
    .orderBy(desc(interacoes.criadoEm))
    .limit(1);
  return !!ult && Date.now() - ult.criadoEm.getTime() < JANELA_24H_MS;
}

export type ResultadoLembretes = { candidatos: number; enviados: number };

/** Envia os lembretes pendentes. Idempotente via flag `lembrete_enviado`. */
export async function processarLembretesReuniao(): Promise<ResultadoLembretes> {
  const agora = Date.now();
  const min = new Date(agora + JANELA_MIN_MIN * 60_000);
  const max = new Date(agora + JANELA_MAX_MIN * 60_000);

  const pendentes = await db
    .select({
      reuniaoId: reunioes.id,
      leadId: reunioes.leadId,
      inicio: reunioes.inicio,
      meetLink: reunioes.meetLink,
      nome: leads.nome,
      whatsapp: leads.whatsapp,
      email: leads.email,
    })
    .from(reunioes)
    .innerJoin(leads, eq(leads.id, reunioes.leadId))
    .where(
      and(
        eq(reunioes.status, "agendada"),
        eq(reunioes.lembreteEnviado, false),
        gte(reunioes.inicio, min),
        lte(reunioes.inicio, max),
        notInArray(leads.status, ["fechado", "perdido", "desqualificado"]),
      ),
    )
    .limit(LOTE);

  let enviados = 0;
  for (const r of pendentes) {
    if (!r.whatsapp) continue;
    const to = r.whatsapp.replace(/\D/g, "");
    const nome = r.nome ? r.nome.split(/\s+/)[0] : "";
    const quando = quandoLabel(r.inicio);

    const aberta = await janela24hAberta(r.leadId);
    const via = aberta ? "texto" : "template";
    const res = aberta
      ? await enviarTextoWhatsApp(to, msgTextoLivre(nome, quando, r.meetLink))
      : await enviarTemplateWhatsApp(to, TEMPLATE_LEMBRETE, TEMPLATE_LANG, [nome, quando]);
    if (!res.ok) {
      console.error(
        `[lembrete] falha WhatsApp (${via}) reunião ${r.reuniaoId}:`,
        ("error" in res && res.error) || res.status,
      );
    }

    // Lembrete por E-MAIL em paralelo — garante o aviso mesmo sem janela de 24h
    // aberta e sem o template Utility aprovado.
    let emailOk = false;
    if (r.email) {
      const em = await sendReuniaoLembreteEmail({
        to: r.email,
        primeiroNome: nome,
        quando,
        meetLink: r.meetLink,
      }).catch(() => ({ ok: false as const }));
      emailOk = em.ok;
    }

    if (!res.ok && !emailOk) {
      continue; // nada saiu → não marca → tenta de novo no próximo run
    }

    const canais = [res.ok ? `whatsapp/${via}` : null, emailOk ? "email" : null]
      .filter(Boolean)
      .join(" + ");
    await db
      .update(reunioes)
      .set({ lembreteEnviado: true, updatedAt: new Date() })
      .where(eq(reunioes.id, r.reuniaoId));
    await db.insert(interacoes).values({
      leadId: r.leadId,
      autorId: null,
      tipo: res.ok ? "whatsapp_enviado" : "evento_sistema",
      conteudo: `⏰ Lembrete de reunião enviado (${canais}) — ${quando}`,
      metadata: {
        canal: "whatsapp_ia",
        automatico: true,
        lembrete: true,
        wamid: res.ok ? (res.id ?? null) : null,
      } as never,
    });
    enviados++;
  }

  return { candidatos: pendentes.length, enviados };
}

// ── Lembrete pro CONSULTOR: e-mail 15 min antes de TODA reunião ─────────────
// Cron a cada 10 min + janela [agora, agora+15min] → chega 5–15 min antes.
// Flag própria (lembrete_consultor_enviado) — independente do lembrete do
// cliente (~30 min, WhatsApp+email).

const CONSULTOR_ANTECEDENCIA_MIN = 15;

export async function processarLembretesConsultor(): Promise<ResultadoLembretes> {
  const agora = Date.now();
  const min = new Date(agora);
  const max = new Date(agora + CONSULTOR_ANTECEDENCIA_MIN * 60_000);

  const pendentes = await db
    .select({
      reuniaoId: reunioes.id,
      inicio: reunioes.inicio,
      meetLink: reunioes.meetLink,
      lead: leads,
      consultorNome: usersTable.nome,
      consultorEmail: usersTable.email,
    })
    .from(reunioes)
    .innerJoin(leads, eq(leads.id, reunioes.leadId))
    .innerJoin(usersTable, eq(usersTable.id, reunioes.consultorId))
    .where(
      and(
        eq(reunioes.status, "agendada"),
        eq(reunioes.lembreteConsultorEnviado, false),
        gte(reunioes.inicio, min),
        lte(reunioes.inicio, max),
        notInArray(leads.status, ["fechado", "perdido", "desqualificado"]),
      ),
    )
    .limit(LOTE);

  let enviados = 0;
  for (const r of pendentes) {
    if (!r.consultorEmail) continue;
    const em = await sendReuniaoLembreteConsultorEmail({
      to: r.consultorEmail,
      consultorNome: r.consultorNome,
      lead: r.lead,
      quando: quandoLabel(r.inicio),
      meetLink: r.meetLink,
    }).catch(() => ({ ok: false as const }));
    if (!em.ok) {
      console.error(`[lembrete-consultor] falha e-mail reunião ${r.reuniaoId}`);
      continue; // não marca → tenta no próximo run (ainda dentro da janela)
    }
    await db
      .update(reunioes)
      .set({ lembreteConsultorEnviado: true, updatedAt: new Date() })
      .where(eq(reunioes.id, r.reuniaoId));
    enviados++;
  }

  return { candidatos: pendentes.length, enviados };
}
