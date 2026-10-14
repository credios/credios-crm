// Validação e formatação de CPF/CNPJ. Usado em forms (cliente) e em
// validators (server) — algoritmo determinístico, zero dependência externa.

/** Normaliza pra só dígitos. */
export function digitsOnly(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

/**
 * Documento sem pontuação, pronto pra guardar. CPF e CNPJ numérico saem só
 * com dígitos; o CNPJ ALFANUMÉRICO (emitido pela Receita desde julho/2026 —
 * 12 posições com letras ou números + 2 dígitos verificadores) mantém as
 * letras, em maiúsculas.
 */
export function limparDocumento(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

const CNPJ_RE = /^[0-9A-Z]{12}\d{2}$/;

/** Detecta o "tipo": 11 dígitos = CPF; 14 posições no formato de CNPJ = CNPJ. */
export function detectKind(value: string | null | undefined): "cpf" | "cnpj" | "unknown" {
  const c = limparDocumento(value);
  if (/^\d{11}$/.test(c)) return "cpf";
  if (CNPJ_RE.test(c)) return "cnpj";
  return "unknown";
}

/** Aplica máscara CPF: 000.000.000-00 */
export function maskCpf(value: string): string {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Aplica máscara CNPJ: 00.000.000/0000-00 (aceita letras do CNPJ alfanumérico) */
export function maskCnpj(value: string): string {
  const d = limparDocumento(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Aplica máscara progressiva conforme o usuário digita: até 11 dígitos vira
 * CPF; passou disso, vira CNPJ. Retorna a string formatada (sem cortar — o
 * call site pode validar tamanho final).
 */
export function maskCpfCnpj(value: string): string {
  const c = limparDocumento(value);
  // Letra só existe em CNPJ; sem letra, decide pelo tamanho.
  if (/[A-Z]/.test(c) || c.length > 11) return maskCnpj(value);
  return maskCpf(value);
}

/** Validador de CPF (algoritmo Receita Federal — 2 dígitos verificadores). */
export function isValidCpf(value: string | null | undefined): boolean {
  const d = digitsOnly(value);
  if (d.length !== 11) return false;
  // Rejeita sequências triviais (000.., 111.., …, 999..)
  if (/^(\d)\1{10}$/.test(d)) return false;

  // Primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]!) * (10 - i);
  let dv1 = (sum * 10) % 11;
  if (dv1 === 10) dv1 = 0;
  if (dv1 !== Number(d[9])) return false;

  // Segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]!) * (11 - i);
  let dv2 = (sum * 10) % 11;
  if (dv2 === 10) dv2 = 0;
  return dv2 === Number(d[10]);
}

/**
 * Validador de CNPJ — numérico e alfanumérico, mesma conta. Cada posição vale
 * o código ASCII do caractere menos 48 ("0"→0 … "9"→9, "A"→17 … "Z"→42);
 * módulo 11 com os pesos de sempre. Pra CNPJ só com números o resultado é
 * idêntico ao algoritmo antigo. Exemplo oficial: 12.ABC.345/01DE-35.
 */
export function isValidCnpj(value: string | null | undefined): boolean {
  const c = limparDocumento(value);
  if (!CNPJ_RE.test(c)) return false;
  if (/^(.)\1{13}$/.test(c)) return false;

  const valor = (i: number) => c.charCodeAt(i) - 48;
  const dv = (pesos: number[]) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += valor(i) * pesos[i]!;
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  // Pesos pra primeiro DV: 5,4,3,2,9,8,7,6,5,4,3,2 — segundo: 6,5,4,3,2,9,8,7,6,5,4,3,2
  if (dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) !== valor(12)) return false;
  return dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === valor(13);
}

/** Valida CPF OU CNPJ baseado no tamanho. */
export function isValidCpfOrCnpj(value: string | null | undefined): boolean {
  const k = detectKind(value);
  if (k === "cpf") return isValidCpf(value);
  if (k === "cnpj") return isValidCnpj(value);
  return false;
}

/**
 * Formata pra exibição: CPF ou CNPJ conforme detecção. Retorna a string
 * original se não for nem um nem outro.
 */
export function formatCpfOrCnpj(value: string | null | undefined): string {
  if (!value) return "";
  const k = detectKind(value);
  if (k === "cpf") return maskCpf(value);
  if (k === "cnpj") return maskCnpj(value);
  return value;
}
