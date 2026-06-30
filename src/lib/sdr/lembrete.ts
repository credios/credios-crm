import "server-only";

import { and, desc, eq, gte, lte } from "drizzle-orm";

import { interacoes, leads, reunioes } from "../../../db/schema";
import { db } from "@/lib/db";
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
    })
    .from(reunioes)
    .innerJoin(leads, eq(leads.id, reunioes.leadId))
    .where(
      and(
        eq(reunioes.status, "agendada"),
        eq(reunioes.lembreteEnviado, false),
        gte(reunioes.inicio, min),
        lte(reunioes.inicio, max),
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
        `[lembrete] falha (${via}) reunião ${r.reuniaoId}:`,
        ("error" in res && res.error) || res.status,
      );
      continue; // não marca → tenta de novo no próximo run (janela é curta)
    }

    await db
      .update(reunioes)
      .set({ lembreteEnviado: true, updatedAt: new Date() })
      .where(eq(reunioes.id, r.reuniaoId));
    await db.insert(interacoes).values({
      leadId: r.leadId,
      autorId: null,
      tipo: "whatsapp_enviado",
      conteudo: `⏰ Lembrete de reunião enviado (${via}) — ${quando}`,
      metadata: {
        canal: "whatsapp_ia",
        automatico: true,
        lembrete: true,
        wamid: res.id ?? null,
      } as never,
    });
    enviados++;
  }

  return { candidatos: pendentes.length, enviados };
}
