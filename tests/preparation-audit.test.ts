import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { GET, POST } from "../app/api/workflow/route";
import { POST as authorPOST } from "../app/api/authoring/route";
import {
  preparationDataSchema,
  preparationSelection,
  publishReceipt,
} from "../lib/workflow/preparation-contracts";
import { roomInstant } from "../lib/operations/rooms";
const id = (n: number) =>
  `08000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const exam = {
  id: id(1),
  title: "Ujian IPS",
  status: "draft",
  lifecycle: "Draf",
  starts_at: "2031-01-10T01:00:00Z",
  ends_at: "2031-01-10T02:00:00Z",
  duration_minutes: 60,
  ready: true,
  participants: 20,
  unconfirmed: 0,
  question_count: 10,
  checks: [
    {
      code: "questions",
      label: "Soal",
      ok: true,
      blocking: true,
      detail: "Lengkap",
      href: "/dashboard/exams?exam=" + id(1),
    },
  ],
};
let result: { data: unknown; error: null }, rpc: ReturnType<typeof vi.fn>;
const req = (input: unknown, path = "/api/workflow") =>
  new Request("https://cbt.test" + path, {
    method: "POST",
    headers: { origin: "https://cbt.test" },
    body: JSON.stringify(input),
  });
beforeEach(() => {
  result = {
    data: { exams: [exam], admin: true, server_now: "2026-11-04T16:00:00Z" },
    error: null,
  };
  rpc = vi.fn(async () => result);
  vi.mocked(actor).mockResolvedValue({
    role: "admin",
    context: "staff",
    client: { rpc },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
});
describe("preparation response and publication audit", () => {
  it("validates real readiness while refusing duplicate exams/checks, missing fields, contradictory readiness and unsafe links", () => {
    expect(preparationDataSchema.safeParse(result.data).success).toBe(true);
    for (const item of [
      { ...exam, checks: [] },
      { ...exam, checks: [exam.checks[0], exam.checks[0]] },
      { ...exam, checks: [{ ...exam.checks[0], ok: false }] },
      { ...exam, checks: [{ ...exam.checks[0], href: "javascript:alert(1)" }] },
    ])
      expect(
        preparationDataSchema.safeParse({
          exams: [item],
          admin: true,
          server_now: "2026-11-04T00:00:00Z",
        }).success,
      ).toBe(false);
    expect(
      preparationDataSchema.safeParse({
        ...(result.data as object),
        exams: [exam, exam],
      }).success,
    ).toBe(false);
  });
  it("chooses only an exam still present in authorized results", () => {
    const list = [
      { id: id(1), status: "archived" },
      { id: id(2), status: "draft" },
    ];
    expect(preparationSelection(list, "stale", id(2))).toBe(id(2));
    expect(preparationSelection(list, id(1), id(2))).toBe(id(1));
    expect(preparationSelection(list, "stale", "missing")).toBe(id(2));
    expect(preparationSelection([], "stale", null)).toBe("");
  });
  it("rejects malformed preparation responses at the API boundary, preserves valid teacher reads", async () => {
    result.data = { exams: null };
    expect(
      (await GET(new Request("https://cbt.test/api/workflow"))).status,
    ).toBe(503);
    result.data = {
      exams: [],
      admin: false,
      server_now: "2026-11-04T00:00:00Z",
    };
    vi.mocked(actor).mockResolvedValue({
      role: "teacher",
      context: "staff",
      client: { rpc },
    } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
    expect(
      (await GET(new Request("https://cbt.test/api/workflow"))).status,
    ).toBe(200);
  });
  it("requires a published receipt belonging to the requested exam", async () => {
    const input = {
      action: "publish",
      exam_id: id(1),
      request_id: id(9),
      confirmation: "PUBLIKASIKAN",
    };
    for (const value of [
      { saved: true },
      { published: false, id: id(1) },
      { published: true, id: id(2) },
    ]) {
      result.data = value;
      expect((await POST(req(input))).status).toBe(503);
    }
    result.data = { published: true, id: id(1) };
    expect((await POST(req(input))).status).toBe(200);
    expect(publishReceipt(id(1)).safeParse(result.data).success).toBe(true);
  });
  it("keeps publication Admin-only and requires origin/confirmation before RPC", async () => {
    const input = {
      action: "publish",
      exam_id: id(1),
      request_id: id(9),
      confirmation: "PUBLIKASIKAN",
    };
    vi.mocked(actor).mockResolvedValue({
      role: "teacher",
      context: "staff",
      client: { rpc },
    } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
    expect((await POST(req(input))).status).toBe(403);
    expect((await POST(req({ ...input, confirmation: "yes" }))).status).toBe(
      422,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a malformed authoring draft receipt without confirming creation", async () => {
    const data = {
      title: "Ujian IPS",
      subject_id: id(2),
      class_ids: [id(3)],
      starts_at: exam.starts_at,
      ends_at: exam.ends_at,
      duration_minutes: 60,
      pin: "1234",
      passing_grade: 0,
      status: "draft",
      bypass_period: false,
      shuffle_questions: false,
      shuffle_options: false,
      configs: ["PG", "PG_KOMPLEKS", "BS", "JODOH", "Esai"].map((type) => ({
        type,
        enabled: true,
        max_questions: 0,
        option_count: 4,
        default_points: 1,
      })),
    };
    result.data = { saved: true };
    expect(
      (
        await authorPOST(
          req(
            { action: "exam", request_id: id(9), exam: data },
            "/api/authoring",
          ),
        )
      ).status,
    ).toBe(503);
    result.data = { id: id(1) };
    expect(
      (
        await authorPOST(
          req(
            { action: "exam", request_id: id(9), exam: data },
            "/api/authoring",
          ),
        )
      ).status,
    ).toBe(200);
  });
  it("converts WIB independently from device timezone and refuses invalid calendar dates", () => {
    expect(roomInstant("2031-01-10T08:00")).toBe("2031-01-10T01:00:00.000Z");
    expect(() => roomInstant("2031-02-30T08:00")).toThrow();
  });
});
