import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Error("REDIRECT:" + url);
  }),
}));
import { actor } from "../lib/auth/actor";
import Supervisor, { metadata } from "../app/supervisor/page";
import { GET, POST } from "../app/api/operations/route";
import {
  GET as workflowGET,
  POST as workflowPOST,
} from "../app/api/workflow/route";
import {
  monitorRowsSchema,
  signalsSchema,
  helpListSchema,
} from "../lib/operations/contracts";
const id = (n: number) =>
  `07000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = {
  student_id: id(1),
  student: "Peserta",
  username: "siswa",
  attempt_id: id(2),
  version: 1,
  status: "in_progress",
  logged_in: true,
  answers: 2,
  events: 0,
  countable_events: 0,
  deadline_at: "2026-11-04T02:00:00Z",
  room: null,
  room_id: null,
  can_act: true,
  score: null,
  pending: 0,
};
let result: { data: unknown; error: null }, rpc: ReturnType<typeof vi.fn>;
const req = (input: unknown, url = "/api/operations") =>
  new Request("https://cbt.test" + url, {
    method: "POST",
    headers: { origin: "https://cbt.test" },
    body: JSON.stringify(input),
  });
beforeEach(() => {
  result = { data: [], error: null };
  rpc = vi.fn(async () => result);
  vi.mocked(actor).mockResolvedValue({
    role: "supervisor",
    context: "supervisor",
    full_name: "Pengawas",
    client: { rpc },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
});
describe("supervisor audit", () => {
  it("allows assigned teacher supervisor context, but rejects staff/student contexts before rendering", async () => {
    expect((await Supervisor()).type).toBe("main");
    vi.mocked(actor).mockResolvedValue({
      role: "teacher",
      context: "supervisor",
      client: { rpc },
    } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
    expect((await Supervisor()).type).toBe("main");
    vi.mocked(actor).mockResolvedValue({
      role: "admin",
      context: "staff",
      client: { rpc },
    } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
    await expect(Supervisor()).rejects.toThrow("REDIRECT:/login");
    expect(metadata.title).toContain("pengawasan");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects duplicate participant, connection and help identities", () => {
    expect(monitorRowsSchema.safeParse([row, row]).success).toBe(false);
    const signal = {
      attempt_id: id(2),
      last_seen_at: null,
      connection: "unknown",
      help_count: 0,
    };
    expect(signalsSchema.safeParse([signal, signal]).success).toBe(false);
    const help = {
      id: id(3),
      attempt_id: id(2),
      student: "Peserta",
      message: "Bantuan",
      created_at: "2026-11-04T00:00:00Z",
      resolved_at: null,
      resolution: null,
      can_resolve: true,
    };
    expect(helpListSchema.safeParse([help, help]).success).toBe(false);
  });
  it("does not accept malformed monitor/options/history as successful reads", async () => {
    result.data = { rows: [] };
    for (const path of [
      "",
      "?action=monitor&exam=" + id(5),
      "?action=history&id=" + id(2),
    ])
      expect(
        (await GET(new Request("https://cbt.test/api/operations" + path)))
          .status,
      ).toBe(503);
    result.data = [row];
    expect(
      (
        await GET(
          new Request(
            "https://cbt.test/api/operations?action=monitor&exam=" + id(5),
          ),
        )
      ).status,
    ).toBe(200);
  });
  it("requires an exam for connection signals and rejects malformed help/signal data", async () => {
    expect(
      (
        await workflowGET(
          new Request("https://cbt.test/api/workflow?action=signals"),
        )
      ).status,
    ).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    result.data = {};
    for (const action of ["signals", "help_list"])
      expect(
        (
          await workflowGET(
            new Request(
              "https://cbt.test/api/workflow?action=" +
                action +
                "&exam=" +
                id(5),
            ),
          )
        ).status,
      ).toBe(503);
  });
  it("does not confirm a partial batch or malformed broadcast receipt", async () => {
    result.data = [{ saved: true }];
    const input = {
      action: "reset",
      request_id: id(8),
      attempts: [
        { id: id(2), version: 1 },
        { id: id(3), version: 2 },
      ],
      reason: "Gangguan jaringan",
      confirmation: "KONFIRMASI",
    };
    expect((await POST(req(input))).status).toBe(503);
    result.data = [{ saved: true }, { reset: true }];
    expect((await POST(req(input))).status).toBe(200);
    result.data = { id: id(9), recipients: 0 };
    expect(
      (
        await POST(
          req({
            action: "broadcast",
            request_id: id(8),
            scope: "exam",
            exam_id: id(5),
            message: "Periksa jaringan",
            title: "Informasi",
          }),
        )
      ).status,
    ).toBe(503);
  });
  it("validates resolve receipt while preserving authorized retry request_id", async () => {
    const input = {
      action: "resolve",
      id: id(3),
      request_id: id(8),
      reason: "Sudah ditangani petugas",
    };
    result.data = { resolved: false };
    expect((await workflowPOST(req(input, "/api/workflow"))).status).toBe(503);
    result.data = { resolved: true };
    expect((await workflowPOST(req(input, "/api/workflow"))).status).toBe(200);
    expect(rpc.mock.calls[0][1].input.request_id).toBe(
      rpc.mock.calls[1][1].input.request_id,
    );
  });
  it("keeps room management and time extension unavailable to supervisor", async () => {
    expect(
      (
        await GET(
          new Request(
            "https://cbt.test/api/operations?action=rooms&exam=" + id(5),
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await workflowPOST(
          req(
            {
              action: "extend",
              attempt_id: id(2),
              request_id: id(8),
              version: 1,
              minutes: 5,
              reason: "Gangguan jaringan",
              confirmation: "TAMBAH WAKTU",
            },
            "/api/workflow",
          ),
        )
      ).status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
