import type { Question } from "../authoring/schema";
export type Answer =
  | string[]
  | Record<string, string>
  | { text: string; canvas_id?: string }
  | null;
export function gradeQuestion(
  q: Question,
  answer: Answer,
  manualGrade?: number | null,
): number | null {
  if (q.type === "Esai") {
    if (manualGrade === undefined || manualGrade === null) return null;
    if (
      !Number.isFinite(manualGrade) ||
      manualGrade < 0 ||
      manualGrade > q.points
    )
      throw Error("Nilai manual di luar bobot.");
    return manualGrade;
  }
  if (q.type === "PG" || q.type === "PG_KOMPLEKS") {
    const picks = Array.isArray(answer) ? [...new Set(answer)] : [];
    if (!picks.length || picks.some((id) => !q.key.includes(id))) return 0;
    if (q.type === "PG") return picks.length === 1 ? q.points : 0;
    return (q.points * picks.length) / q.key.length;
  }
  const values =
    answer && !Array.isArray(answer) ? (answer as Record<string, string>) : {};
  const correct = q.options.filter((o, i) => values[o.id] === q.key[i]).length;
  return q.options.length ? (q.points * correct) / q.options.length : 0;
}
export function summarize(items: { earned: number | null; max: number }[]) {
  const pending = items.filter((i) => i.earned === null).length;
  const earned = items.reduce((s, i) => s + (i.earned ?? 0), 0),
    max = items.reduce((s, i) => s + i.max, 0);
  return {
    earned,
    max,
    pending,
    score: pending ? null : max ? Math.round((10000 * earned) / max) / 100 : 0,
  };
}
