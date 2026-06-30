import { eq } from "drizzle-orm";

import type { InferSelectModel } from "drizzle-orm";
import { leads, users } from "../../../db/schema";
import { db } from "@/lib/db";
import type { Slot } from "@/lib/calendar/disponibilidade";
import type { FatosQualificacao } from "@/lib/sdr/qualificacao";
import type { Qualificacao } from "@/lib/whatsapp/heloisa";

type Lead = InferSelectModel<typeof leads>;

// Roteamento (pós-qualificação): ≥ R$ 400k → Gabriel; < R$ 400k → Rodrigo.
const CREDITO_LIMITE_CENTAVOS = 40_000_000;
const EMAIL_ALTO = "gabriel.meirelles@credios.com.br";
const EMAIL_PADRAO = "rodrigo@credios.com.br";

/**
 * Flag de segurança do SDR. DESLIGADO por padrão → o bot se comporta exatamente
 * como hoje. Liga globalmente com SDR_AGENDAMENTO=on, ou só pra números de teste
 * (lista separada por vírgula em SDR_TESTE_PHONES) — pra validar isolado.
 */
export function sdrAtivo(phone: string): boolean {
  if (process.env.SDR_AGENDAMENTO === "on") return true;
  const alvo = phone.replace(/\D/g, "").slice(-8);
  if (alvo.length < 8) return false;
  return (process.env.SDR_TESTE_PHONES ?? "")
    .split(",")
    .map((p) => p.replace(/\D/g, "").slice(-8))
    .filter((p) => p.length === 8)
    .includes(alvo);
}

const simNao = (v: string | null | undefined): boolean | null =>
  v === "sim" ? true : v === "nao" ? false : null;

/** Junta os fatos do cadastro com o que a IA capturou nesta troca (e o persistido). */
export function montarFatos(lead: Lead, q: Qualificacao): FatosQualificacao {
  const reg = (q.imovel_regularizado ?? lead.qualifImovelRegularizado ?? null) as
    | "sim"
    | "nao"
    | "nao_sei"
    | null;
  return {
    valorCreditoCentavos: lead.valorCreditoCentavos,
    valorImovelCentavos: lead.valorImovelCentavos,
    saldoDevedorCentavos: lead.saldoDevedorCentavos,
    situacaoImovel: lead.situacaoImovel,
    tipoImovel: lead.tipoImovel,
    temImovelGarantia: simNao(q.tem_imovel_garantia ?? lead.qualifTemImovelGarantia),
    imovelRegularizado: reg,
    pendenciaBloqueante: simNao(q.pendencia_bloqueante ?? lead.qualifPendenciaBloqueante),
  };
}

export type ConsultorSel = { id: string; email: string; nome: string };

async function userPorEmail(email: string): Promise<ConsultorSel | null> {
  const [u] = await db
    .select({ id: users.id, email: users.email, nome: users.nome, ativo: users.ativo })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return u && u.ativo ? { id: u.id, email: u.email, nome: u.nome } : null;
}

/** Escolhe o consultor por valor do crédito (com fallback pro outro se inativo). */
export async function escolherConsultor(
  valorCreditoCentavos: number | null,
): Promise<ConsultorSel | null> {
  const alto = (valorCreditoCentavos ?? 0) >= CREDITO_LIMITE_CENTAVOS;
  return (
    (await userPorEmail(alto ? EMAIL_ALTO : EMAIL_PADRAO)) ??
    (await userPorEmail(alto ? EMAIL_PADRAO : EMAIL_ALTO))
  );
}

/** Consultor já atribuído ao lead (pra fase de agendamento). */
export async function consultorDoLead(consultorId: string): Promise<ConsultorSel | null> {
  const [u] = await db
    .select({ id: users.id, email: users.email, nome: users.nome })
    .from(users)
    .where(eq(users.id, consultorId))
    .limit(1);
  return u ?? null;
}

// ── Mensagens (texto livre — vão na janela de 24h, sem template) ──────────────

export function msgOfertaHorarios(primeiroNome: string, slots: Slot[]): string {
  const lista = slots.map((s) => `• ${s.label}`).join("\n");
  return [
    `Perfeito, ${primeiroNome}! Já tenho o que preciso 🙂`,
    "Pra adiantar, o nosso consultor pode falar com você numa conversa rápida por vídeo (10–15 min): entender o seu caso, explicar como a Credios trabalha e já iniciar a busca pelo seu crédito.",
    `Tenho estes horários:\n${lista}`,
    "Qual fica melhor? Se nenhum servir, me diz um horário que você prefira.",
  ].join("\n\n");
}

export function msgConfirmacao(
  rotulo: string,
  meetLink: string | null,
  portalUrl: string,
): string {
  const link = meetLink ? `\nLink da videochamada: ${meetLink}` : "";
  return [
    `Agendado! ✅ ${rotulo} (horário de Brasília). Você vai receber o convite no seu e-mail.${link}`,
    `📄 Pra adiantar e o consultor já chegar com tudo em mãos na conversa, deixe seus documentos prontos por aqui:\n${portalUrl}`,
  ].join("\n\n");
}

export function msgManual(primeiroNome: string, portalUrl: string): string {
  return [
    `Obrigada, ${primeiroNome}! Já tenho os seus dados — um consultor vai entrar em contato com você em breve.`,
    `📄 Pra adiantar a análise, se quiser já pode deixar seus documentos prontos por aqui:\n${portalUrl}`,
  ].join("\n\n");
}

export function msgReoferta(slots: Slot[]): string {
  if (!slots.length) {
    return "Esse horário não está disponível 😕 Pode me sugerir outro dia útil, entre 08h e 18h (horário de Brasília)?";
  }
  return `Esse horário não está mais disponível 😕 Tenho estes:\n${slots
    .map((s) => `• ${s.label}`)
    .join("\n")}\n\nQual prefere?`;
}
