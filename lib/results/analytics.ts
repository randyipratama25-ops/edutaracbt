import type { ResultDetail } from "./types";
const round = (n: number) => Math.round(n * 1e10) / 1e10;
export const difficulty = (p: number) =>
  p < 0.3 ? "Sukar" : p > 0.7 ? "Mudah" : "Sedang";
export const discrimination = (d: number) =>
  d < 0
    ? "Negatif / buang"
    : d < 0.2
      ? "Jelek"
      : d < 0.3
        ? "Cukup"
        : d < 0.4
          ? "Baik"
          : "Sangat baik";
export function analyze(details: ResultDetail[]) {
  // Pick a student's most recent completed, officially graded attempt; reset/DQ/pending never enter N.
  const eligible = details.filter(
    (d) =>
      ["submitted", "time_expired", "graded"].includes(d.attempt.status) &&
      d.attempt.pending === 0 &&
      d.attempt.score !== null,
  );
  const latest = new Map<string, ResultDetail>();
  for (const d of eligible) {
    const key = d.attempt.exam_id + ":" + d.attempt.student_id;
    const old = latest.get(key);
    if (
      !old ||
      d.attempt.finalized_at > old.attempt.finalized_at ||
      (d.attempt.finalized_at === old.attempt.finalized_at &&
        d.attempt.id > old.attempt.id)
    )
      latest.set(key, d);
  }
  const cohort = Array.from(latest.values()).sort(
    (a, b) =>
      b.attempt.score! - a.attempt.score! ||
      a.attempt.id.localeCompare(b.attempt.id),
  );
  const groups = new Map<
    string,
    { detail: ResultDetail; question: ResultDetail["questions"][number] }[]
  >();
  for (const d of cohort)
    for (const q of d.questions) {
      const key = d.attempt.exam_id + ":" + q.id + ":" + q.version;
      groups.set(key, [...(groups.get(key) || []), { detail: d, question: q }]);
    }
  const items = Array.from(groups.entries()).map(([id, entries]) => {
    const q = entries[0].question,
      n = entries.length,
      k = Math.max(1, Math.floor(0.27 * n));
    const ratio = (e: (typeof entries)[number]) =>
      Math.max(
        0,
        Math.min(1, (e.question.earned ?? 0) / e.question.payload.points),
      );
    const p = round(entries.reduce((s, e) => s + ratio(e), 0) / n);
    const top = entries.slice(0, k),
      bottom = entries.slice(-k);
    const d = round(
      top.reduce((s, e) => s + ratio(e), 0) / k -
        bottom.reduce((s, e) => s + ratio(e), 0) / k,
    );
    const options = q.payload.options.map((option, index) => {
      const choices: Record<string, number> = {};
      let correct = 0;
      const wrong: { student: string; attempt_id: string }[] = [];
      for (const e of entries) {
        const answer = e.question.answer;
        const record =
          answer && typeof answer === "object" && !Array.isArray(answer)
            ? (answer as Record<string, unknown>)
            : {};
        const picked = Array.isArray(answer)
          ? answer.includes(option.id)
          : record[option.id];
        if (q.payload.type === "PG" || q.payload.type === "PG_KOMPLEKS") {
          if (picked) choices.selected = (choices.selected || 0) + 1;
        } else {
          const value = String(picked ?? "Belum dijawab");
          choices[value] = (choices[value] || 0) + 1;
          if (picked === e.question.payload.key[index]) correct++;
          else
            wrong.push({
              student: e.detail.attempt.student,
              attempt_id: e.detail.attempt.id,
            });
        }
      }
      return { id: option.id, text: option.text, choices, correct, wrong };
    });
    return {
      id,
      exam_id: entries[0].detail.attempt.exam_id,
      question_id: q.id,
      version: q.version,
      type: q.payload.type,
      stem: q.payload.stem,
      n,
      group_size: k,
      p,
      d,
      difficulty: difficulty(p),
      discrimination: discrimination(d),
      small_sample: n < 4,
      wrong: entries
        .filter((e) => ratio(e) < 1)
        .map((e) => ({
          student: e.detail.attempt.student,
          attempt_id: e.detail.attempt.id,
          earned: e.question.earned,
          max: e.question.payload.points,
        })),
      options,
      essay:
        q.payload.type === "Esai"
          ? entries.map((e) => ({
              student: e.detail.attempt.student,
              earned: e.question.earned,
              max: e.question.payload.points,
            }))
          : [],
    };
  });
  return {
    eligible: cohort.length,
    excluded: details.length - cohort.length,
    items,
  };
}
