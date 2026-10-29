export type AnswerValue = string[] | Record<string, string>;
export type RecoveryRow = { value: AnswerValue; revision: number };
export type RecoveryDraft = {
  version: 1;
  epoch: number;
  updatedAt: number;
  rows: Record<string, RecoveryRow>;
};
export function sameAnswer(a: AnswerValue, b: AnswerValue) {
  const canonical = (v: AnswerValue) => JSON.stringify(Array.isArray(v)
    ? [...v].sort()
    : Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))));
  return canonical(a) === canonical(b);
}
export function parseDraft(raw: string | null, now = Date.now()): RecoveryDraft | null {
  if (!raw || raw.length > 8_000_000) return null;
  try {
    const d = JSON.parse(raw);
    if (d.version !== 1 || !Number.isInteger(d.epoch) || d.epoch < 1 ||
      !Number.isFinite(d.updatedAt) || d.updatedAt > now + 60000 ||
      now - d.updatedAt > 86400000 || !d.rows || Array.isArray(d.rows) || typeof d.rows !== 'object' ||
      Object.keys(d.rows).length > 2000) return null;
    for (const row of Object.values(d.rows) as RecoveryRow[]) {
      if (!row || !Number.isInteger(row.revision) || row.revision < 0 || !row.value || typeof row.value !== 'object') return null;
      if (Array.isArray(row.value) ? !row.value.every(v => typeof v === 'string') : !Object.values(row.value).every(v => typeof v === 'string')) return null;
    }
    return d;
  } catch { return null; }
}
// The browser clock is only for display. Every write is still checked by the server.
export function secondsRemaining(deadline: string, serverTime: number, elapsed: number) {
  return Math.max(0, Math.ceil((Date.parse(deadline) - serverTime - Math.max(0, elapsed)) / 1000));
}
export function receiptOf(a: { id: string; status: string; finalized_at: string | null }) {
  return a.finalized_at && ['submitted', 'time_expired'].includes(a.status)
    ? { number: `EDU-${a.id}`, receivedAt: a.finalized_at, status: a.status }
    : null;
}
