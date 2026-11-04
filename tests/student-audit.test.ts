import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { GET, POST } from "../app/api/attempts/route";
import { parseAttempt, examListSchema } from "../lib/attempts/contracts";
import { receiptOf } from "../lib/attempts/recovery";
const id = "10000000-0000-4000-8000-000000000001";
const dto = {
  id,
  exam_id: id,
  title: "Ujian",
  status: "in_progress",
  deadline_at: "2026-11-04T23:00:00Z",
  server_now: "2026-11-04T22:00:00Z",
  epoch: 1,
  finalized_at: null,
  questions: [
    {
      id,
      version: 1,
      position: 1,
      payload: {
        type: "JODOH",
        stem: "Pasangkan",
        options: [{ id: "a", text: "A" }],
        choices: ["Benar", "Pengecoh"],
        distractors: ["Pengecoh"],
        key: ["Benar"],
        rubricCriteria: [{ id: "secret" }],
        rubric: "secret",
        explanation: "secret",
        keywords: ["secret"],
      },
    },
  ],
  answers: [],
  grading_pending: 0,
  score: null,
  result_visible: false,
  review_reason: null,
};
const rpc = vi.fn();
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: { exams: [] }, error: null });
  vi.mocked(actor).mockResolvedValue({
    role: "student",
    context: "student",
    client: { rpc },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
});
const request = (input: unknown, origin = "https://cbt.test") =>
  new Request("https://cbt.test/api/attempts", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(input),
  });
it("strips authoring secrets and distractor labels but retains shuffled matching choices", () => {
  const a = parseAttempt(dto);
  expect(a.questions[0].payload).toHaveProperty("choices", [
    "Benar",
    "Pengecoh",
  ]);
  for (const key of [
    "key",
    "distractors",
    "rubric",
    "rubricCriteria",
    "explanation",
    "keywords",
  ])
    expect(a.questions[0].payload).not.toHaveProperty(key);
});
it("rejects corrupt dates, answers, duplicate questions and malformed lists", () => {
  for (const data of [
    { ...dto, server_now: "invalid" },
    { ...dto, answers: null },
    { ...dto, questions: [dto.questions[0], dto.questions[0]] },
    { ...dto, epoch: 0 },
  ])
    expect(() => parseAttempt(data)).toThrow();
  for (const data of [null, { exams: [null] }, { exams: {} }])
    expect(examListSchema.safeParse(data).success).toBe(false);
});
it("reports malformed lists as unavailable rather than empty", async () => {
  rpc.mockResolvedValue({ data: { exams: [{ id }] }, error: null });
  expect((await GET()).status).toBe(503);
});
it.each(["admin", "teacher", "supervisor"])(
  "denies %s in student context before RPC",
  async (role) => {
    vi.mocked(actor).mockResolvedValue({
      role,
      context: "student",
      client: { rpc },
    } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
    expect((await GET()).status).toBe(403);
    expect(
      (await POST(request({ action: "resume", attempt_id: id, client_id: id })))
        .status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  },
);
it("rejects cross-origin writes and handles anonymous access", async () => {
  expect(
    (
      await POST(
        request(
          { action: "resume", attempt_id: id, client_id: id },
          "https://other.test",
        ),
      )
    ).status,
  ).toBe(403);
  vi.mocked(actor).mockResolvedValue(null);
  expect((await GET()).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
it("preserves active response/recovery while removing fields from the server boundary", async () => {
  rpc
    .mockResolvedValueOnce({ data: dto, error: null })
    .mockResolvedValueOnce({ data: { drafts: [], canvases: [] }, error: null });
  const r = await POST(
    request({ action: "resume", attempt_id: id, client_id: id }),
  );
  expect(r.status).toBe(200);
  const data = (await r.json()).data;
  expect(data.recovery).toEqual({ drafts: [], canvases: [] });
  expect(data.questions[0].payload).not.toHaveProperty("distractors");
});
it("marks invalid finalization receipts and transport failures uncertain, retaining conflict semantics", async () => {
  rpc.mockResolvedValueOnce({ data: { id, status: "submitted" }, error: null });
  expect(
    (
      await POST(
        request({
          action: "submit",
          attempt_id: id,
          client_id: id,
          epoch: 1,
          request_id: id,
          mode: "manual",
        }),
      )
    ).status,
  ).toBe(503);
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "private connection failed", code: "08006" },
  });
  const r = await POST(
    request({ action: "resume", attempt_id: id, client_id: id }),
  );
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("private connection");
  rpc.mockResolvedValueOnce({
    data: null,
    error: { code: "P0001", message: "DEVICE_CONFLICT: Sesi lain" },
  });
  expect(
    (await POST(request({ action: "resume", attempt_id: id, client_id: id })))
      .status,
  ).toBe(409);
});
it("retains confirmed receipts after grading, never for unconfirmed or disqualified results", () => {
  expect(
    receiptOf({ id, status: "graded", finalized_at: "2026-11-04T22:00:00Z" })
      ?.number,
  ).toBe("EDU-" + id);
  expect(receiptOf({ id, status: "graded", finalized_at: null })).toBeNull();
  expect(
    receiptOf({
      id,
      status: "disqualified",
      finalized_at: "2026-11-04T22:00:00Z",
    }),
  ).toBeNull();
});

it("preserves policy and acknowledgement metadata while malformed supplemental recovery degrades independently", () => {
  const policy = {
    integrity_mode: "review",
    unlock_time: "fixed_deadline",
    tolerance_ms: 1500,
    incident_cooldown_ms: 10000,
  };
  const saved = {
    question_id: id,
    revision: 1,
    value: ["A"],
    saved_at: "2026-11-04T22:00:00Z",
    checksum: "a".repeat(64),
  };
  const a = parseAttempt({
    ...dto,
    policy,
    answers: [saved],
    recovery: { drafts: null },
  });
  expect(a).toHaveProperty("policy", policy);
  expect(a.answers[0]).toEqual(saved);
  expect(a.recovery).toBeNull();
});

it("uses readable uncertain errors for non-JSON or incomplete successful command responses", async () => {
  const { command } = await import("../components/attempts/queue");
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html>unavailable</html>", { status: 200 }),
      ),
    );
    await expect(
      command({ action: "resume", attempt_id: id, client_id: id }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("belum dapat dibaca"),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              data: { id, status: "in_progress" },
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(
      command({ action: "resume", attempt_id: id, client_id: id }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("belum dapat dipastikan"),
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
