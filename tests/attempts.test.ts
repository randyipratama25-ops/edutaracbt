import { essayLength } from "../lib/attempts/essay";
import { describe, it, expect } from "vitest";
import { questionSchema } from "../lib/authoring/schema";
import { templates } from "../lib/authoring/imports";
import { gradeQuestion, summarize } from "../lib/attempts/grading";
import { attemptCommand, safeAnswer } from "../lib/attempts/validation";
describe("central grading primitives", () => {
  it("PG full/zero and PGK partial without wrong picks", () => {
    const pg = questionSchema.parse(templates.PG),
      pk = questionSchema.parse(templates.PG_KOMPLEKS);
    expect(gradeQuestion(pg, ["A"])).toBe(1);
    expect(gradeQuestion(pg, ["B"])).toBe(0);
    expect(gradeQuestion(pk, ["A"])).toBe(1);
    expect(
      gradeQuestion(
        { ...pk, options: [...pk.options, { id: "C", text: "Wrong" }] },
        ["A", "C"],
      ),
    ).toBe(0);
    expect(gradeQuestion(pk, ["A", "A"])).toBe(1);
  });
  it("BS and matching partial by stable IDs, independent of display order", () => {
    const q = questionSchema.parse({
      ...(templates.BS as object),
      points: 10,
      options: [
        { id: "s1", text: "One" },
        { id: "s2", text: "Two" },
      ],
      key: ["true", "false"],
    });
    expect(gradeQuestion(q, { s1: "true", s2: "true" })).toBe(5);
    const m = questionSchema.parse({
      ...(templates.JODOH as object),
      points: 10,
    });
    expect(gradeQuestion(m, { s1: "Jakarta", s2: "Wrong" })).toBe(5);
  });
  it("distinguishes pending essay from official zero", () => {
    expect(
      gradeQuestion(questionSchema.parse(templates.Esai), { text: "Essay" }),
    ).toBeNull();
    expect(
      summarize([
        { earned: 10, max: 10 },
        { earned: null, max: 10 },
      ]).score,
    ).toBeNull();
    expect(summarize([{ earned: 0, max: 10 }]).score).toBe(0);
    expect(
      summarize([
        { earned: 10, max: 10 },
        { earned: 5, max: 10 },
        { earned: 0, max: 10 },
      ]).score,
    ).toBe(50);
  });
});
describe("attempt request boundaries", () => {
  it("rejects invalid PIN and oversized batches", () => {
    expect(
      attemptCommand.safeParse({
        action: "start",
        exam_id: crypto.randomUUID(),
        client_id: crypto.randomUUID(),
        pin: "bad",
      }).success,
    ).toBe(false);
    expect(
      attemptCommand.safeParse({
        action: "save",
        attempt_id: crypto.randomUUID(),
        client_id: crypto.randomUUID(),
        epoch: 1,
        request_id: crypto.randomUUID(),
        answers: Array(101).fill({
          question_id: crypto.randomUUID(),
          expected_revision: 0,
          value: [],
        }),
      }).success,
    ).toBe(false);
  });
  it("sanitizes HTML in essays and keeps full large typed text", () => {
    const text = "a".repeat(80000);
    expect(safeAnswer.parse({ text })).toEqual({ text });
    expect(
      safeAnswer.parse({ text: "<img src=x onerror=alert(1)><b>ok</b>" }),
    ).toEqual({ text: "<b>ok</b>" });
  });
  it("requires writer epoch and versioned answer revisions", () => {
    expect(
      attemptCommand.safeParse({
        action: "save",
        attempt_id: crypto.randomUUID(),
        client_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        answers: [
          {
            question_id: crypto.randomUUID(),
            expected_revision: -1,
            value: [],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("meaningful essay character count", () => {
  it("excludes markup, formulas, entities and symbols", () => {
    expect(essayLength("<b>abc</b> $x+1$ &nbsp; ≤≥")).toBe(3);
  });
  it("counts Arabic plain characters", () => {
    expect(essayLength("<p>سلام</p>")).toBe(4);
  });
});
