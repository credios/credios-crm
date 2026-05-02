/** Devolve só os dígitos do telefone (sem +, espaços ou pontuação). */
export function digitsOnly(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

/** Constrói URL pra abrir conversa no WhatsApp. */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const d = digitsOnly(phone);
  if (d.length < 8) return null;
  return `https://wa.me/${d}`;
}

/**
 * Formata WhatsApp para display: "+55 47 99999-0001" (BR) ou mantém E.164.
 * Não 100% robusto pra todos os países, mas serve pro caso BR comum.
 */
export function formatPhoneBr(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = digitsOnly(phone);
  if (d.length === 13 && d.startsWith("55")) {
    // +55 DDD 9NNNN-NNNN
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 11) {
    return `+55 ${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  return phone;
}

/** CPF: "***.***.***-XX" → mantém. "12345678901" → "123.456.789-01". */
export function formatCpf(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
