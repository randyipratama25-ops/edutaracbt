import { describe, expect, it } from "vitest";
import { parseDraft, sameAnswer, secondsRemaining, receiptOf } from "../lib/attempts/recovery";
describe("answer/session recovery boundaries", () => {
  it("rejects damaged, expired and malformed drafts", () => {
    const draft = { version: 1, epoch: 2, updatedAt: 1000, rows: { q: { revision: 0, value: { text: "Essay" } } } };
    expect(parseDraft(JSON.stringify(draft), 1001)).toEqual(draft);
    expect(parseDraft(JSON.stringify(draft), 86402000)).toBeNull();
    expect(parseDraft("{bad")).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft, rows: { q: { revision: -1, value: [] } } }), 1001)).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft, rows: { q: { revision: 0, value: { text: 1 } } } }), 1001)).toBeNull();
  });
  it("compares answers by meaning rather than object key or choice order", () => {
    expect(sameAnswer(["B", "A"], ["A", "B"])).toBe(true);
    expect(sameAnswer({ a: "true", b: "false" }, { b: "false", a: "true" })).toBe(true);
    expect(sameAnswer({ text: "one" }, { text: "two" })).toBe(false);
  });
  it("uses server deadline and elapsed time; a shortened deadline takes immediate effect", () => {
    const server = Date.parse("2026-10-30T00:00:00Z");
    expect(secondsRemaining("2026-10-30T00:01:00Z", server, 10500)).toBe(50);
    expect(secondsRemaining("2026-10-30T00:00:10Z", server, 10500)).toBe(0);
  });
  it("issues stable receipt references only for accepted finalization, never active/reset/disqualified attempts", () => {
    const attempt = { id: "attempt-id", status: "submitted", finalized_at: "2026-10-30T00:00:00Z" };
    expect(receiptOf(attempt)).toEqual(receiptOf({ ...attempt }));
    expect(receiptOf(attempt)?.number).toBe("EDU-attempt-id");
    for (const status of ["in_progress", "reset", "disqualified"]) expect(receiptOf({ ...attempt, status })).toBeNull();
    expect(receiptOf({ ...attempt, finalized_at: null })).toBeNull();
  });
});
