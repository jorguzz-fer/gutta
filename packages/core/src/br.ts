// Documentos e telefones do Brasil (SPEC v2, CAD-01). Sem I/O.

/** Só os dígitos. */
export const digits = (s: string) => s.replace(/\D/g, '');

/** CPF válido pelos dígitos verificadores. Rejeita sequências repetidas (111.111.111-11). */
export function isValidCpf(input: string): boolean {
  const cpf = digits(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

/** Formato de exibição: 000.000.000-00. */
export function formatCpf(input: string): string {
  const c = digits(input);
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`;
}

/** CPF mascarado, como aparece na tela depois de salvo: ***.***.***-00. */
export function maskCpf(lastTwo: string): string {
  return `***.***.***-${digits(lastTwo).slice(-2).padStart(2, '*')}`;
}

/**
 * Telefone em E.164 (+5511987654321). Sem DDI, assume o Brasil. Celular brasileiro tem
 * DDD de 2 dígitos e 9 dígitos começando com 9; fixo, 8 dígitos. Devolve null se não fechar.
 */
export function normalizePhone(input: string, defaultCountry = '55'): string | null {
  const raw = input.trim();
  let d = digits(raw);
  if (!d) return null;
  if (raw.startsWith('+')) {
    if (d.startsWith('55')) d = d.slice(2);
    else return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  } else if (d.length > 11 && d.startsWith(defaultCountry)) {
    d = d.slice(defaultCountry.length);
  }
  if (d.startsWith('0')) d = d.slice(1);
  const ddd = d.slice(0, 2);
  const number = d.slice(2);
  if (!/^[1-9][0-9]$/.test(ddd)) return null;
  const mobile = number.length === 9 && number.startsWith('9');
  const landline = number.length === 8 && /^[2-5]/.test(number);
  if (!mobile && !landline) return null;
  return `+55${ddd}${number}`;
}
