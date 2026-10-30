import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn() }));
vi.mock("../lib/auth/actor", () => ({ actor: mocks.actor }));
import { GET, POST } from "../app/api/workflow/route";
const id = "03000000-0000-4000-8000-000000000001";
const extend = {
  action: "extend",
  attempt_id: id,
  request_id: id,
  version: 1,
  minutes: 5,
  reason: "Gangguan jaringan",
  confirmation: "TAMBAH WAKTU",
};
const request = (input: unknown, origin = "https://cbt.test") =>
  new Request("https://cbt.test/api/workflow", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
const as = (role: string, context: string) =>
  mocks.actor.mockResolvedValue({ role, context, client: { rpc: mocks.rpc } });
beforeEach(() => {
  mocks.actor.mockReset();
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: { saved: true }, error: null });
  as("admin", "staff");
});
describe("workflow API boundaries", () => {
  it("denies anonymous and cross-origin requests before a database write", async () => {
    mocks.actor.mockResolvedValue(null);
    expect((await POST(request(extend))).status).toBe(401);
    as("admin", "staff");
    expect((await POST(request(extend, "https://other.test"))).status).toBe(
      403,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("allows time allowance only in Admin staff context", async () => {
    for (const [role, context] of [
      ["teacher", "staff"],
      ["supervisor", "supervisor"],
      ["admin", "supervisor"],
      ["student", "student"],
    ]) {
      as(role, context);
      expect((await POST(request(extend))).status).toBe(403);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    as("admin", "staff");
    expect((await POST(request(extend))).status).toBe(200);
  });
  it("separates student help from staff resolution", async () => {
    as("teacher", "staff");
    expect(
      (
        await POST(
          request({
            action: "help",
            attempt_id: id,
            request_id: id,
            message: "Butuh bantuan pengawas",
          }),
        )
      ).status,
    ).toBe(403);
    as("student", "student");
    expect(
      (
        await POST(
          request({
            action: "resolve",
            id,
            request_id: id,
            reason: "Sudah ditangani",
          }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request({
            action: "help",
            attempt_id: id,
            request_id: id,
            message: "Butuh bantuan pengawas",
          }),
        )
      ).status,
    ).toBe(200);
  });
  it("blocks preparation and signals from student contexts", async () => {
    as("student", "student");
    expect(
      (await GET(new Request("https://cbt.test/api/workflow"))).status,
    ).toBe(403);
    expect(
      (
        await GET(
          new Request(
            "https://cbt.test/api/workflow?action=signals&exam=" + id,
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns conflicts without retrying a non-idempotent new request", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "CONFLICT: status berubah" },
    });
    expect((await POST(request(extend))).status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
