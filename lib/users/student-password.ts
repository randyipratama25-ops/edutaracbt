/**
 * Student password policy: exactly 11 uppercase letters/digits followed by
 * exactly one approved punctuation mark. Ambiguous glyphs are excluded.
 * This module is safe to use in the browser; uniqueness is enforced by the server.
 */
export const STUDENT_LETTERS = "ABCDEFGHJKLMNPQRTUVWXYZ";
export const STUDENT_DIGITS = "2346789";
export const STUDENT_SYMBOLS = "!@#$*?";
const BODY = STUDENT_LETTERS + STUDENT_DIGITS;
const PASSWORD_RE = /^[A-HJ-NP-RT-Z2346789]{11}[!@#$*?]$/;

export function isStudentPassword(value: string): boolean {
  return PASSWORD_RE.test(value) &&
    /[A-HJ-NP-RT-Z]/.test(value.slice(0, 11)) &&
    /[2346789]/.test(value.slice(0, 11));
}

function randomIndex(length: number): number {
  // Reject modulo-biased samples. Never use Math.random for credentials.
  const sample = new Uint32Array(1);
  const upper = Math.floor(0x100000000 / length) * length;
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= upper);
  return sample[0] % length;
}

export function generateStudentPassword(): string {
  // Seed one letter and one digit, fill the remainder, then shuffle.
  const chars = [
    STUDENT_LETTERS[randomIndex(STUDENT_LETTERS.length)],
    STUDENT_DIGITS[randomIndex(STUDENT_DIGITS.length)],
    ...Array.from({ length: 9 }, () => BODY[randomIndex(BODY.length)]),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("") + STUDENT_SYMBOLS[randomIndex(STUDENT_SYMBOLS.length)];
}
