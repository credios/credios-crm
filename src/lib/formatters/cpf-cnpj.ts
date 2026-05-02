// Validação e formatação de CPF/CNPJ. Usado em forms (cliente) e em
// validators (server) — algoritmo determinístico, zero dependência externa.

/** Normaliza pra só dígitos. */
export function digitsOnly(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

/** Detecta o "tipo" baseado em quantidade de dígitos. */
export function detectKind(value: string | null | undefined): "cpf" | "cnpj" | "unknown" {
  const d = digitsOnly(value);
  if (d.length === 11) return "cpf";
  if (d.length === 14) return "cnpj";
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

/** Aplica máscara CNPJ: 00.000.000/0000-00 */
export function maskCnpj(value: string): string {
  const d = digitsOnly(value).slice(0, 14);
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
  const d = digitsOnly(value);
  if (d.length <= 11) return maskCpf(value);
  return maskCnpj(value);
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

/** Validador de CNPJ (algoritmo Receita Federal — 2 dígitos verificadores). */
export function isValidCnpj(value: string | null | undefined): boolean {
  const d = digitsOnly(value);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  // Pesos pra primeiro DV: 5,4,3,2,9,8,7,6,5,4,3,2
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]!) * w1[i]!;
  let dv1 = sum % 11;
  dv1 = dv1 < 2 ? 0 : 11 - dv1;
  if (dv1 !== Number(d[12])) return false;

  // Pesos pra segundo DV: 6,5,4,3,2,9,8,7,6,5,4,3,2
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(d[i]!) * w2[i]!;
  let dv2 = sum % 11;
  dv2 = dv2 < 2 ? 0 : 11 - dv2;
  return dv2 === Number(d[13]);
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
