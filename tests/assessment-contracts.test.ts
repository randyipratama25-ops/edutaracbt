import { describe, expect, it } from "vitest";
import {
  assessmentDetail,
  assessmentList,
  assessmentPublications,
  assessmentReceipt,
} from "../lib/assessment/contracts";

const id = "00000000-0000-4000-8000-000000000001";
const attempt = {
  id,
  exam_id: id,
  code: "Peserta AA1",
  title: "Ujian",
  pending: 1,
  revision: 0,
  score: null,
};

describe("assessment transport", () => {
  it("preserves anonymous rows and rejects an incomplete queue", () => {
    expect(
      assessmentDetail.parse({
        attempt: { ...attempt, student: "Nama" },
        questions: [],
      }).attempt,
    ).toEqual(attempt);
    expect(
      assessmentList.safeParse({ rows: [attempt], total: -1, admin: true })
        .success,
    ).toBe(false);
  });

  it("recognizes offset publication timestamps and negative cancellation receipts", () => {
    expect(
      assessmentPublications.safeParse([
        {
          exam_id: id,
          scheduled_at: "2026-11-06T10:00:00+07:00",
          state: "blocked",
          error: null,
        },
      ]).success,
    ).toBe(true);
    expect(
      assessmentReceipt("/api/assessment", { action: "cancel" }).parse({
        cancelled: false,
      }),
    ).toEqual({ cancelled: false });
    expect(
      assessmentReceipt("/api/assessment", { action: "schedule" }).safeParse({
        saved: true,
      }).success,
    ).toBe(false);
  });

  it("requires a revision receipt for official grades and preserves zero", () => {
    const receipt = assessmentReceipt("/api/results", {
      action: "grade_batch",
    });
    expect(receipt.safeParse([]).success).toBe(false);
    expect(
      receipt.safeParse([
        { attempt_id: id, revision: 1, score: 0, pending: 0, passed: false },
      ]).success,
    ).toBe(true);
  });
});
