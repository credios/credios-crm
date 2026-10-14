// Partes puras (sem banco) das comissões — testáveis fora do servidor.

/** "YYYY-MM-DD" + n dias corridos. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a!, m! - 1, d! + dias));
  return dt.toISOString().slice(0, 10);
}


export const ARQUIVO_MAX_BYTES = 5 * 1024 * 1024;

/** Aceita só PDF, PNG ou JPEG — conferido pelos primeiros bytes, não pelo
 *  nome nem pelo tipo que o navegador declara. */
export function tipoDoArquivo(bytes: Uint8Array): "application/pdf" | "image/png" | "image/jpeg" | null {
  const h = (n: number) => bytes[n];
  if (h(0) === 0x25 && h(1) === 0x50 && h(2) === 0x44 && h(3) === 0x46) return "application/pdf";
  if (h(0) === 0x89 && h(1) === 0x50 && h(2) === 0x4e && h(3) === 0x47) return "image/png";
  if (h(0) === 0xff && h(1) === 0xd8 && h(2) === 0xff) return "image/jpeg";
  return null;
}

