/**
 * Internal login identifier for students who do not have a real email.
 * example.com is an IANA-reserved documentation domain; it cannot be treated
 * as a deliverable mailbox. The address is never presented as the student's
 * contact email and must never be used for password-recovery delivery.
 *
 * Supabase Auth requires an email for the existing email/password sign-in,
 * even though EDUTARA CBT authenticates students by username in its gateway.
 */
const INTERNAL_STUDENT_EMAIL = /^student-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@example\.com$/i;

export function createInternalStudentEmail(): string {
  return `student-${crypto.randomUUID()}@example.com`;
}

export function isInternalStudentEmail(email: string): boolean {
  return INTERNAL_STUDENT_EMAIL.test(email);
}
