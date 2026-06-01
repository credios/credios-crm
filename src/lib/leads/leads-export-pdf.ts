import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import type { LeadRow } from "@/lib/leads/list-leads";

/**
 * Exportação de leads em PDF (tabela), para discussão interna com a equipe.
 *
 * Não usamos lib de PDF — seguimos o mesmo padrão de impressão do resto do
 * CRM (window.print() → "Salvar como PDF"): montamos um HTML autocontido,
 * abrimos numa janela e disparamos a impressão. Os dados vêm do
 * `selectedLeads` (já filtrado por permissão/RLS quando a lista carregou),
 * espelhando o export CSV.
 *
 * Campos ESSENCIAIS apenas (sem excesso): nome, cidade, status, valor
 * buscado, data de criação e data do último contato.
 */

/** Escapa HTML — os campos do lead são dados livres do cliente. */
function esc(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFmt.format(date);
}

/**
 * Monta o documento HTML completo da exportação. Função pura (recebe a data
 * de geração por parâmetro) — fácil de testar sem `window`/`Date.now`.
 */
export function buildLeadsExportHtml(leads: LeadRow[], generatedAt: Date): string {
  const count = leads.length;
  const geradoEm = dateTimeFmt.format(generatedAt);
  const totalBuscado = leads.reduce(
    (acc, l) => acc + (l.valorCreditoCentavos ?? 0),
    0,
  );

  const rows =
    leads
      .map((l) => {
        const local =
          [l.cidade, l.estado].filter(Boolean).map(esc).join(" / ") || "—";
        const status = esc(STATUS_LEAD_LABEL[l.status] ?? l.status);
        const valor =
          l.valorCreditoCentavos != null
            ? esc(formatBrlFromCents(l.valorCreditoCentavos))
            : "—";
        return `<tr>
          <td class="nome">${esc(l.nome) || "—"}</td>
          <td>${local}</td>
          <td><span class="pill">${status}</span></td>
          <td class="num strong">${valor}</td>
          <td class="num muted">${fmtDate(l.createdAt)}</td>
          <td class="num muted">${fmtDate(l.ultimoContato)}</td>
        </tr>`;
      })
      .join("") ||
    `<tr><td colspan="6" class="empty">Nenhum lead selecionado.</td></tr>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Leads — Credios (${count})</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #141E30; margin: 0; font-size: 11px; line-height: 1.4;
  }

  header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 4px; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
  .brand b { color: #C79A3A; font-weight: 800; }
  .subtitle { font-size: 11px; color: #6b7280; margin-top: 5px; letter-spacing: 0.02em; }
  .meta { text-align: right; font-size: 10px; color: #6b7280; line-height: 1.6; white-space: nowrap; }
  .meta .big { display: block; font-size: 13px; font-weight: 700; color: #141E30; }
  .rule { height: 2px; background: #141E30; margin: 9px 0 0; }
  .rule + .accent { height: 2px; width: 64px; background: #C79A3A; }

  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  thead { display: table-header-group; }
  th {
    text-align: left; background: #141E30; color: #fff; font-size: 8.5px;
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    padding: 8px 10px; white-space: nowrap;
  }
  th.num { text-align: right; }
  td { padding: 8px 10px; border-bottom: 1px solid #ececec; vertical-align: middle; }
  tr { break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #faf8f3; }
  .nome { font-weight: 600; color: #141E30; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .strong { font-weight: 700; }
  .muted { color: #6b7280; }
  .empty { text-align: center; color: #9ca3af; padding: 24px; }
  .pill {
    display: inline-block; padding: 2px 9px; border-radius: 999px;
    background: #eef1f6; color: #2b3a55; font-size: 9.5px; font-weight: 600;
    white-space: nowrap;
  }

  .summary {
    display: flex; justify-content: flex-end; gap: 28px; margin-top: 14px;
    padding-top: 10px; border-top: 2px solid #141E30; font-size: 11px;
  }
  .summary .label { color: #6b7280; }
  .summary .value { font-weight: 700; font-variant-numeric: tabular-nums; }
  .summary .value.total { color: #C79A3A; font-size: 13px; }

  footer { margin-top: 22px; font-size: 8.5px; color: #9ca3af; }
</style>
</head>
<body onload="window.print()">
  <header>
    <div>
      <div class="brand">Cred<b>i</b>os</div>
      <div class="subtitle">Relatório de Leads</div>
    </div>
    <div class="meta">
      <span class="big">${count} lead${count === 1 ? "" : "s"}</span>
      Gerado em ${esc(geradoEm)}
    </div>
  </header>
  <div class="rule"></div>
  <div class="accent"></div>

  <table>
    <thead>
      <tr>
        <th>Nome</th>
        <th>Cidade</th>
        <th>Status</th>
        <th class="num">Valor buscado</th>
        <th class="num">Criado em</th>
        <th class="num">Últ. contato</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="summary">
    <div><span class="label">Leads:</span> <span class="value">${count}</span></div>
    <div><span class="label">Total buscado:</span> <span class="value total">${esc(formatBrlFromCents(totalBuscado))}</span></div>
  </div>

  <footer>CRM Credios · uso interno · contém dados de clientes — não compartilhar externamente.</footer>
  <script>window.onafterprint = function () { window.close(); };</script>
</body>
</html>`;
}

/**
 * Abre uma janela com a tabela de leads e dispara a impressão (o usuário
 * salva como PDF). Retorna `false` se o pop-up foi bloqueado pelo navegador.
 */
export function openLeadsPrintWindow(leads: LeadRow[]): boolean {
  const html = buildLeadsExportHtml(leads, new Date());
  // Sem `noopener`: precisamos escrever no documento da nova janela (mesma
  // origem, about:blank). A impressão é disparada pelo onload do próprio HTML.
  const win = window.open("", "_blank", "width=900,height=800");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
