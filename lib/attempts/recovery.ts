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

export function deviceDrafts(ownerId: string, attemptId: string) {
  const prefix = `edutara:draft:v1:${ownerId}:${attemptId}:`;
  const candidates: { key: string; draft: RecoveryDraft }[] = [];
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) {
      if (!key?.startsWith(prefix)) continue;
      const draft = parseDraft(localStorage.getItem(key));
      if (draft) candidates.push({ key, draft });
      else localStorage.removeItem(key);
    }
  } catch { /* Queue reports blocked device storage separately. */ }
  return candidates.sort((a, b) => b.draft.updatedAt - a.draft.updatedAt);
}
export function clearDeviceDrafts(ownerId: string, attemptId: string) {
  for (const { key } of deviceDrafts(ownerId, attemptId)) localStorage.removeItem(key);
}
export function pruneAcknowledgedDrafts(ownerId: string, attemptId: string, questionId: string, value: AnswerValue) {
  for (const { key, draft } of deviceDrafts(ownerId, attemptId)) {
    if (!draft.rows[questionId] || !sameAnswer(draft.rows[questionId].value, value)) continue;
    delete draft.rows[questionId];
    if (Object.keys(draft.rows).length) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  }
}
export type CanvasDraft = { image: string; mediaId?: string; updatedAt: number };
export function parseCanvasDraft(raw: string | null, now = Date.now()): CanvasDraft | null {
  try {
    const d = JSON.parse(raw || 'null');
    return d && typeof d.image === 'string' && d.image.startsWith('data:image/png;base64,') &&
      d.image.length <= 7_000_000 && Number.isFinite(d.updatedAt) && now-d.updatedAt < 86400000 &&
      d.updatedAt <= now+60000 ? d : null;
  } catch { return null; }
}
export function storeCanvasDraft(key: string, image: string, mediaId?: string) {
  localStorage.setItem(key, JSON.stringify({ image, mediaId, updatedAt: Date.now() }));
}
