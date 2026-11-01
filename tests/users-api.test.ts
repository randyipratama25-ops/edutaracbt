import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
vi.mock("../lib/auth/gateway", () => ({ gateway: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { gateway } from "../lib/auth/gateway";
import { GET, POST } from "../app/api/admin/users/route";
const id = "03000000-0000-4000-8000-000000000001";
const session = vi.fn(),
  chain = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    abortSignal: vi.fn(),
  },
  from = vi.fn(() => chain);
function asActor(role = "admin", context = "staff") {
  return {
    role,
    context,
    organization_id: "org",
    client: { from, auth: { getSession: session } },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>;
}
const post = (payload: unknown, origin = "https://app.test") =>
  POST(
    new Request("https://app.test/api/admin/users", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["select", "eq", "or", "order", "range"] as const)
    chain[key].mockReturnValue(chain);
  chain.abortSignal.mockResolvedValue({ data: [], count: 0, error: null });
  vi.mocked(actor).mockResolvedValue(asActor());
  session.mockResolvedValue({ data: { session: { access_token: "token" } } });
  vi.mocked(gateway).mockResolvedValue({ saved: true });
});
describe("users API compatibility and guards", () => {
  it("scopes reads to organization, escapes literal underscores and preserves filters/sort/page size", async () => {
    const r = await GET(
      new Request(
        "https://app.test/api/admin/users?q=siswa_1&role=student&active=false&sort=desc&page=2",
      ),
    );
    expect(r.status).toBe(200);
    expect(chain.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(chain.eq).toHaveBeenCalledWith("active", false);
    expect(chain.or).toHaveBeenCalledWith(
      "username.ilike.%siswa\\_1%,full_name.ilike.%siswa\\_1%",
    );
    expect(chain.order).toHaveBeenCalledWith("username", { ascending: false });
    expect(chain.range).toHaveBeenCalledWith(20, 39);
    expect(chain.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("limits teachers to students and keeps malformed/negative pages bounded", async () => {
    vi.mocked(actor).mockResolvedValue(asActor("teacher"));
    await GET(new Request("https://app.test/api/admin/users?page=-999"));
    expect(chain.eq).toHaveBeenCalledWith("role", "student");
    expect(chain.range).toHaveBeenCalledWith(0, 19);
  });
  it("fails unavailable counts/data safely instead of returning false zero or leaking SQL", async () => {
    for (const result of [
      { data: [], count: null },
      { data: null, count: 0 },
      { data: [], count: 1, error: { message: "SECRET_SQL" } },
    ]) {
      chain.abortSignal.mockResolvedValueOnce(result);
      const r = await GET(new Request("https://app.test/api/admin/users"));
      expect(r.status).toBe(503);
      expect(await r.text()).not.toContain("SECRET_SQL");
    }
  });
  it("blocks unauthorized list/mutations and wrong Origin before gateway", async () => {
    expect(
      (await post({ operation: "archive", id }, "https://outside.test")).status,
    ).toBe(403);
    for (const a of [
      null,
      asActor("student", "student"),
      asActor("teacher", "supervisor"),
    ]) {
      vi.mocked(actor).mockResolvedValue(a);
      expect(
        (await GET(new Request("https://app.test/api/admin/users"))).status,
      ).toBe(403);
      expect((await post({ operation: "archive", id })).status).toBe(403);
    }
    expect(gateway).not.toHaveBeenCalled();
  });
  it("validates command/ID/fields before gateway and rejects empty updates", async () => {
    for (const body of [
      null,
      [],
      {},
      { operation: "archive", id: "bad" },
      { operation: "update", id },
      { operation: "update", id, full_name: " " },
      { operation: "create", username: "invalid name" },
    ]) {
      expect((await post(body)).status).toBe(422);
    }
    expect(gateway).not.toHaveBeenCalled();
  });
  it("rejects teacher admin operations but keeps permitted rename/create staff context", async () => {
    vi.mocked(actor).mockResolvedValue(asActor("teacher"));
    for (const data of [
      { operation: "archive", id },
      { operation: "update", id, active: false },
      { operation: "invitation_info", id },
      { operation: "resend_invitation", id },
      {
        operation: "create",
        username: "guru-1",
        full_name: "Guru",
        email: "guru@example.test",
        role: "teacher",
      },
    ])
      expect((await post(data)).status).toBe(403);
    expect(gateway).not.toHaveBeenCalled();
    expect(
      (await post({ operation: "update", id, full_name: " Nama Baru " }))
        .status,
    ).toBe(200);
    expect(gateway).toHaveBeenCalledWith(
      {
        operation: "update",
        id,
        full_name: "Nama Baru",
        action: "manage_user",
      },
      "token",
    );
  });
  it("keeps invitation operation and verified session token contract; absent session does not call gateway", async () => {
    vi.mocked(gateway).mockResolvedValue({
      email: "u@example.test",
      eligible: true,
      reason: "",
    });
    expect((await post({ operation: "invitation_info", id })).status).toBe(200);
    expect(gateway).toHaveBeenCalledWith(
      { operation: "invitation_info", id, action: "manage_user" },
      "token",
    );
    vi.mocked(gateway).mockClear();
    session.mockResolvedValue({ data: { session: null } });
    expect((await post({ operation: "archive", id })).status).toBe(401);
    expect(gateway).not.toHaveBeenCalled();
  });
  it("preserves normalized teacher student creation and class assignment payload", async () => {
    vi.mocked(actor).mockResolvedValue(asActor("teacher"));
    vi.mocked(gateway).mockResolvedValue({ id, username: "siswa-baru" });
    const r = await post({
      operation: "create",
      username: "Siswa-Baru",
      full_name: " Siswa Baru ",
      email: "siswa@example.test",
      role: "student",
      class_id: id,
    });
    expect(r.status).toBe(200);
    expect(gateway).toHaveBeenCalledWith(
      {
        operation: "create",
        username: "siswa-baru",
        full_name: "Siswa Baru",
        email: "siswa@example.test",
        role: "student",
        class_id: id,
        action: "manage_user",
      },
      "token",
    );
  });
});
