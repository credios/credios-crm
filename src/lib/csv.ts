/**
 * Helpers de export CSV (RFC 4180).
 * UTF-8 com BOM (﻿) pra Excel não embromar acento.
 */

export function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv<T>(
  rows: T[],
  columns: { header: string; get: (row: T) => unknown }[],
): string {
  const headers = columns.map((c) => escapeCsv(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeCsv(c.get(r))).join(","))
    .join("\n");
  return `${headers}\n${body}`;
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
