import { readFileSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { questionSchema } from "../lib/authoring/schema";
import { gradeQuestion, summarize, type Answer } from "../lib/attempts/grading";
type Legacy = {
  type?: string;
  weight?: number;
  grade?: number | null;
  key?: string | Record<string, string>;
  correct?: string[];
  options?: string[];
  answer?: string | string[] | Record<string, string>;
  statements?: string[];
  pairs?: { q: string; a: string }[];
  key_id?: string;
  answer_id?: string;
  items?: { earned: number; max: number }[];
};
const normalize = (x: string) =>
  /^(benar|sesuai|true|1)$/i.test(x) ? "true" : "false";
function run(x: Legacy) {
  if (x.items) {
    const s = summarize(x.items.map((i) => ({ earned: i.earned, max: i.max })));
    return {
      earned_points: s.earned,
      max_points: s.max,
      score_percent: s.score,
    };
  }
  const base = { stem: "Fixture", points: x.weight!, required: true };
  if (x.type === "Esai") {
    const q = questionSchema.parse({ ...base, type: "Esai" });
    const grade = gradeQuestion(q, { text: "Essay" }, x.grade);
    return {
      earned_points: grade ?? 0,
      grading_status: grade === null ? "ungraded" : "graded",
    };
  }
  let options: { id: string; text: string }[] = [],
    key: string[] = [],
    answer: Answer = null;
  if (x.type === "PG") {
    if (x.key_id) {
      options = (x.options || []).map((text, i) => ({
        id: i === 0 ? "b" : "a",
        text,
      }));
      key = [x.key_id];
      answer = [x.answer_id!];
    } else {
      options = (x.options || []).map((text, i) => ({
        id: String.fromCharCode(65 + i),
        text,
      }));
      const original = options.find((o) => o.text === x.key || o.id === x.key);
      key = [original!.id];
      answer = [
        options.find((o) => o.text === x.answer || o.id === x.answer)!.id,
      ];
    }
  } else if (x.type === "PG_KOMPLEKS") {
    options = [
      ...new Set([...(x.correct || []), ...(x.answer as string[])]),
    ].map((id) => ({ id, text: id }));
    key = x.correct!;
    answer = x.answer as string[];
  } else if (x.type === "BS") {
    options = x.statements!.map((text, i) => ({ id: "s" + i, text }));
    const k = x.key as Record<string, string>,
      v = x.answer as Record<string, string>;
    key = options.map((o, i) => normalize(k[o.text] ?? k[i]));
    answer = Object.fromEntries(
      options.map((o, i) => [o.id, normalize(v[i] ?? v[o.text])]),
    );
  } else {
    options = x.pairs!.map((p, i) => ({ id: "p" + i, text: p.q }));
    key = x.pairs!.map((p) => p.a);
    const v = x.answer as Record<string, string>;
    answer = Object.fromEntries(options.map((o) => [o.id, v[o.text]]));
  }
  const q = questionSchema.parse({ ...base, type: x.type, options, key });
  return { earned_points: gradeQuestion(q, answer) };
}
describe("12 legacy golden contracts via explicit canonical adapters", () => {
  for (const file of readdirSync("tests/fixtures/legacy").filter((f) =>
    f.endsWith(".json"),
  )) {
    const fixture = JSON.parse(
      readFileSync("tests/fixtures/legacy/" + file, "utf8"),
    );
    it(file, () => {
      expect(run(fixture.input)).toMatchObject(fixture.expected);
    });
  }
});
