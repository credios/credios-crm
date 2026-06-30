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

/**
 * Próximos horários LIVRES (bloco de 30 min) na agenda do consultor, dentro do
 * horário comercial (08–18 BRT, dias úteis), com antecedência mínima. Espalha os
 * horários oferecidos pra dar variedade. A agenda real do consultor é a fonte da
 * verdade — nunca oferece slot ocupado.
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

  const livres: Slot[] = [];
  let ultimo = 0;
  for (const c of candidatos) {
    if (sobrepoe(c.inicio, c.fim, busy)) continue;
    if (ultimo && c.inicio.getTime() - ultimo < ESPALHAR_MIN * 60_000) continue;
    livres.push({
      inicioISO: c.inicio.toISOString(),
      fimISO: c.fim.toISOString(),
      label: label(c.inicio),
    });
    ultimo = c.inicio.getTime();
    if (livres.length >= max) break;
  }
  return livres;
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
