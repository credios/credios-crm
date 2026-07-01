import { freeBusy, type BusyInterval } from "@/lib/calendar/google";
import { isBusinessDayBrt, startOfDayBrt, toYmdInBrt } from "@/lib/datetime/brt";

// Parâmetros de oferta de horários (ajustáveis aqui; viram tela configurável na
// Fase 3). Reunião rápida (10–15 min); reservamos um bloco de 30 min com folga.
const DURACAO_MIN = 30; // bloco reservado na agenda
const PASSO_MIN = 30; // grade de horários (08:00, 08:30, …)
const ANTECEDENCIA_MIN = 120; // 2h de antecedência mínima
const DIAS_UTEIS_FRENTE = 5; // janela de busca
const HORA_INICIO = 8; // 08:00 BRT
const HORA_FIM = 18; // 18:00 BRT (último início = 17:30, termina às 18:00)
const ESPALHAR_MIN = 90; // distância mínima entre horários oferecidos (variedade)
const MAX_SLOTS = 3;

export type Slot = { inicioISO: string; fimISO: string; label: string };

const fmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
/** "terça-feira, 01/07 às 14:30" */
function label(d: Date): string {
  const p = fmt.formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("weekday")}, ${g("day")}/${g("month")} às ${g("hour")}:${g("minute")}`;
}

function sobrepoe(inicio: Date, fim: Date, busy: BusyInterval[]): boolean {
  const a = inicio.getTime();
  const b = fim.getTime();
  return busy.some((x) => {
    const s = new Date(x.start).getTime();
    const e = new Date(x.end).getTime();
    return a < e && s < b; // há sobreposição
  });
}

function periodoBrt(inicio: Date): "AM" | "PM" {
  const ymd = toYmdInBrt(inicio);
  const minNoDia = (inicio.getTime() - startOfDayBrt(ymd).getTime()) / 60_000;
  return minNoDia < 12 * 60 ? "AM" : "PM";
}

/**
 * Escolhe até `max` horários VARIADOS (não amontoados). Em vez de pegar os N
 * primeiros livres — que caem todos na manhã do 1º dia (8h, 9h, 10h) —, cobre
 * buckets diferentes de dia×período (manhã/tarde): 1 representante por bucket, na
 * ordem cronológica. Dentro do bucket, manhã pega o mais cedo e tarde o mais
 * tarde, espalhando no dia (ex.: 08:30 + 17:30). Se sobrar vaga (poucos buckets),
 * completa com horários distantes ≥ ESPALHAR_MIN dos já escolhidos.
 *
 * Motivo: quem não pode às 8h normalmente também não pode às 9h — oferecer manhã
 * E tarde (e dias diferentes) aumenta muito a chance de encaixe.
 */
export function escolherVariados(
  free: { inicio: Date; fim: Date }[],
  max: number,
): { inicio: Date; fim: Date }[] {
  const buckets = new Map<string, { inicio: Date; fim: Date }[]>();
  for (const f of free) {
    const key = `${toYmdInBrt(f.inicio)}|${periodoBrt(f.inicio)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(f);
    else buckets.set(key, [f]);
  }

  const escolhidos: { inicio: Date; fim: Date }[] = [];
  // 1 representante por bucket (Map preserva ordem de inserção = cronológica).
  // Manhã → mais cedo; tarde → mais tarde (espalha dentro do dia).
  for (const [key, arr] of buckets) {
    if (escolhidos.length >= max) break;
    escolhidos.push(key.endsWith("PM") ? arr[arr.length - 1]! : arr[0]!);
  }

  // Poucos buckets → completa com horários bem distantes dos já escolhidos.
  if (escolhidos.length < max) {
    for (const f of free) {
      if (escolhidos.length >= max) break;
      if (escolhidos.some((e) => e.inicio.getTime() === f.inicio.getTime())) continue;
      const distante = escolhidos.every(
        (e) => Math.abs(e.inicio.getTime() - f.inicio.getTime()) >= ESPALHAR_MIN * 60_000,
      );
      if (distante) escolhidos.push(f);
    }
  }

  return escolhidos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime()).slice(0, max);
}

/**
 * Próximos horários LIVRES (bloco de 30 min) na agenda do consultor, dentro do
 * horário comercial (08–18 BRT, dias úteis), com antecedência mínima. Oferece
 * horários VARIADOS (manhã/tarde, dias diferentes — ver escolherVariados). A
 * agenda real do consultor é a fonte da verdade — nunca oferece slot ocupado.
 */
export async function horariosDisponiveis(
  consultorEmail: string,
  max = MAX_SLOTS,
): Promise<Slot[]> {
  const agora = Date.now();
  const minInicio = agora + ANTECEDENCIA_MIN * 60_000;

  // gera candidatos varrendo dias úteis à frente
  const candidatos: { inicio: Date; fim: Date }[] = [];
  let diasUteis = 0;
  for (let offset = 0; offset < 14 && diasUteis < DIAS_UTEIS_FRENTE; offset++) {
    const ymd = toYmdInBrt(new Date(agora + offset * 864e5));
    if (!isBusinessDayBrt(ymd)) continue;
    diasUteis++;
    const inicioDia = startOfDayBrt(ymd).getTime(); // 00:00 BRT (em UTC)
    for (let m = HORA_INICIO * 60; m + DURACAO_MIN <= HORA_FIM * 60; m += PASSO_MIN) {
      const inicio = new Date(inicioDia + m * 60_000);
      if (inicio.getTime() < minInicio) continue;
      candidatos.push({ inicio, fim: new Date(inicio.getTime() + DURACAO_MIN * 60_000) });
    }
  }
  if (candidatos.length === 0) return [];

  const busy = await freeBusy(
    consultorEmail,
    new Date(minInicio).toISOString(),
    candidatos[candidatos.length - 1]!.fim.toISOString(),
  );

  const free = candidatos.filter((c) => !sobrepoe(c.inicio, c.fim, busy));
  if (free.length === 0) return [];

  return escolherVariados(free, max).map((c) => ({
    inicioISO: c.inicio.toISOString(),
    fimISO: c.fim.toISOString(),
    label: label(c.inicio),
  }));
}

/** Valida se um horário específico (proposto pelo cliente) está livre e dentro da política. */
export async function horarioEstaLivre(
  consultorEmail: string,
  inicioISO: string,
): Promise<{ ok: boolean; motivo?: "ocupado" | "fora_horario" | "passado"; fimISO: string }> {
  const inicio = new Date(inicioISO);
  const fim = new Date(inicio.getTime() + DURACAO_MIN * 60_000);
  const fimISO = fim.toISOString();
  if (inicio.getTime() < Date.now() + ANTECEDENCIA_MIN * 60_000) {
    return { ok: false, motivo: "passado", fimISO };
  }
  const ymd = toYmdInBrt(inicio);
  if (!isBusinessDayBrt(ymd)) return { ok: false, motivo: "fora_horario", fimISO };
  const inicioDia = startOfDayBrt(ymd).getTime();
  const minutosNoDia = (inicio.getTime() - inicioDia) / 60_000;
  if (minutosNoDia < HORA_INICIO * 60 || minutosNoDia + DURACAO_MIN > HORA_FIM * 60) {
    return { ok: false, motivo: "fora_horario", fimISO };
  }
  const busy = await freeBusy(consultorEmail, inicioISO, fimISO);
  if (sobrepoe(inicio, fim, busy)) return { ok: false, motivo: "ocupado", fimISO };
  return { ok: true, fimISO };
}
