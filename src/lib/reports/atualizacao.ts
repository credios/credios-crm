// ═══════════════════════════════════════════════════════════
// Quando os relatórios se atualizam (decisão do owner, 2026-10-28).
//
// Os números dos relatórios são recalculados duas vezes por dia, às 9h e às
// 18h de Brasília, e quando alguém clica em "Atualizar dados" em /relatorios.
// A janela vigente entra na chave de todo cache de relatório: virou a hora,
// a chave muda e o cron /api/cron/aquecer-relatorios já deixa a janela nova
// calculada. O botão invalida a tag e a próxima leitura recalcula.
// ═══════════════════════════════════════════════════════════

/** Tag de todo `unstable_cache` dos relatórios (queries.ts). */
export const RELATORIOS_CACHE_TAG = "reports:dashboards";

/** Horas de Brasília em que os relatórios viram (crons em vercel.json). */
export const HORAS_ATUALIZACAO_RELATORIOS = [9, 18] as const;

/** UTC-3 fixo, como em datetime/brt.ts. */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Janela de atualização vigente, ex.: "2026-10-28T09". Antes das 9h vale a
 * janela das 18h do dia anterior.
 */
export function janelaRelatorios(agora: Date = new Date()): string {
  const brt = new Date(agora.getTime() - BRT_OFFSET_MS);
  const hora = brt.getUTCHours();
  const horas = [...HORAS_ATUALIZACAO_RELATORIOS].reverse();
  const vigente = horas.find((h) => hora >= h);
  if (vigente !== undefined) {
    return `${brt.toISOString().slice(0, 10)}T${String(vigente).padStart(2, "0")}`;
  }
  const ontem = new Date(brt.getTime() - 24 * 60 * 60 * 1000);
  const ultima = HORAS_ATUALIZACAO_RELATORIOS[HORAS_ATUALIZACAO_RELATORIOS.length - 1];
  return `${ontem.toISOString().slice(0, 10)}T${String(ultima).padStart(2, "0")}`;
}
