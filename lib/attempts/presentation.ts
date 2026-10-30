import { essayLength } from "./essay";
import type { AnswerValue } from "./recovery";
export type Completion = "empty" | "partial" | "complete";
type QuestionShape = { type: string; options: { id: string }[]; minChars?: number; required?: boolean };
export const questionTypeLabels: Record<string,string> = { PG: "Pilihan ganda", PG_KOMPLEKS: "Pilihan ganda kompleks", BS: "Benar / salah", JODOH: "Menjodohkan", Esai: "Esai" };
export function completion(q: QuestionShape, value?: AnswerValue): Completion {
  if (!value) return "empty";
  if (["PG", "PG_KOMPLEKS"].includes(q.type)) return Array.isArray(value) && value.length > 0 ? "complete" : "empty";
  if (Array.isArray(value)) return "empty";
  if (["BS", "JODOH"].includes(q.type)) {
    const answered = q.options.filter(o => (value[o.id] || "").trim() !== "").length;
    return answered === 0 ? "empty" : answered === q.options.length ? "complete" : "partial";
  }
  const count = essayLength(value.text || "");
  if (count === 0 && !value.canvas_id) return "empty";
  return count >= (q.minChars || 0) ? "complete" : "partial";
}
export function progressSummary(questions: { id: string; payload: QuestionShape }[], values: Record<string, AnswerValue>, flagged: string[]) {
  const summary = { complete: 0, empty: 0, partial: 0, flagged: 0, requiredMissing: 0 };
  for (const q of questions) {
    const state = completion(q.payload, values[q.id]);
    summary[state]++;
    if (flagged.includes(q.id)) summary.flagged++;
    if (q.payload.required !== false && state !== "complete") summary.requiredMissing++;
  }
  return summary;
}
export const completionLabels: Record<Completion,string> = { empty: "Belum dijawab", partial: "Belum lengkap", complete: "Terjawab" };
