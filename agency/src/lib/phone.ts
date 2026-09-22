/**
 * Israeli phone helpers. Accepts what people actually type — "050-1234567",
 * "+972 50 123 4567", "0501234567" — and normalises to E.164 (+9725…).
 */

const DIGITS = /\D+/g;

/** Strip everything but digits, handling a leading + and 00 prefix. */
export function digitsOnly(input: string): string {
  return input.replace(DIGITS, '');
}

/**
 * Returns the E.164 number (e.g. "+972501234567") when the input is a valid
 * Israeli mobile or landline number, otherwise null.
 */
export function normalizeIsraeliPhone(input: string): string | null {
  let d = digitsOnly(input);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('972')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  else return null;
  // Mobile 5X-XXXXXXX (9 digits), landline area codes 2/3/4/8/9 + 7 digits (8 digits),
  // and 7X (VoIP/1-800 style) 9 digits.
  if (/^5\d{8}$/.test(d) || /^7\d{8}$/.test(d) || /^[23489]\d{7}$/.test(d)) {
    return `+972${d}`;
  }
  return null;
}

export function isValidIsraeliPhone(input: string): boolean {
  return normalizeIsraeliPhone(input) !== null;
}

/** "972501234567" → "050-123-4567" for display. */
export function formatPhoneDisplay(international: string): string {
  const d = digitsOnly(international).replace(/^972/, '');
  if (d.length === 9) return `0${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `0${d.slice(0, 1)}-${d.slice(1, 4)}-${d.slice(4)}`;
  return `0${d}`;
}

/** tel: href from an international number without "+". */
export function telHref(international: string): string {
  return `tel:+${digitsOnly(international)}`;
}
