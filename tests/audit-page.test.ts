import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
import { actor } from "../lib/auth/actor";
import { GET } from "../app/api/system/route";
import {
  auditCSV,
  auditListSchema,
  auditQuery,
  collectAudit,
} from "../lib/system/audit";
const row = (n = 1) => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  created_at: "2026-11-02T01:00:00Z",
  actor: null,
  action: "LOGIN",
  target_type: "profile",
  target_id: null,
});
const rpc = vi.fn();
beforeEach(() => {
  rpc
    .mockReset()
    .mockResolvedValue({ data: { rows: [row()], total: 1 }, error: null });
  vi.mocked(actor).mockResolvedValue({
    role: "admin",
    context: "staff",
    client: { rpc },
  } as unknown as NonNullable<Awaited<ReturnType<typeof actor>>>);
});
const req = (q = "") =>
  new Request("https://cbt.test/api/system?action=audit" + q);
it.each([
  null,
  { role: "teacher", context: "staff" },
  { role: "admin", context: "supervisor" },
  { role: "student", context: "student" },
])("denies unauthorized context %j before RPC", async (a) => {
  vi.mocked(actor).mockResolvedValue(
    a as unknown as Awaited<ReturnType<typeof actor>>,
  );
  expect((await GET(req())).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
it.each(["NaN", "Infinity", "1.5", "0", "-1", "100001", ""])(
  "rejects invalid page %s",
  async (p) => {
    expect((await GET(req("&page=" + p))).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  },
);
it("rejects reversed date bounds before querying", async () => {
  expect(
    (await GET(req("&from=2026-11-03T00:00:00Z&until=2026-11-02T00:00:00Z")))
      .status,
  ).toBe(422);
  expect(rpc).not.toHaveBeenCalled();
});
it("returns read-only validated fields and preserves tenant-bound RPC", async () => {
  rpc.mockResolvedValue({
    data: { rows: [{ ...row(), metadata: { secret: "hidden" } }], total: 1 },
    error: null,
  });
  const r = await GET(req("&page=2&search=LOGIN"));
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect((await r.json()).data.rows[0]).not.toHaveProperty("metadata");
  expect(rpc).toHaveBeenCalledWith("system_command", {
    input: expect.objectContaining({
      action: "audit",
      page: 2,
      search: "LOGIN",
    }),
  });
});
it.each([
  null,
  { rows: null, total: 1 },
  { rows: [{ ...row(), created_at: "bad" }], total: 1 },
  { rows: [], total: -1 },
  { rows: [row()], total: 0 },
])("rejects corrupt receipts %j", async (data) => {
  rpc.mockResolvedValue({ data, error: null });
  expect((await GET(req())).status).toBe(503);
});
it("converts WIB filters independently of device timezone and validates real dates", () => {
  const q = new URL(
    auditQuery(
      {
        search: "  LOGIN  ",
        from: "2026-11-02T08:00",
        until: "2026-11-02T09:00",
      },
      1,
    ),
    "https://test",
  );
  expect(q.searchParams.get("from")).toBe("2026-11-02T01:00:00.000Z");
  expect(q.searchParams.get("search")).toBe("LOGIN");
  expect(() =>
    auditQuery({ search: "", from: "2026-02-30T08:00", until: "" }, 1),
  ).toThrow();
});
it("bounds pages and rejects inconsistent export rather than downloading partial data", async () => {
  const first = Array.from({ length: 50 }, (_, i) => row(i + 1));
  const read = vi
    .fn()
    .mockResolvedValueOnce({ rows: first, total: 51 })
    .mockResolvedValueOnce({ rows: [], total: 51 });
  await expect(collectAudit(read)).rejects.toThrow("belum lengkap");
  expect(read).toHaveBeenCalledTimes(2);
});
it("rejects duplicate IDs and changing totals during export", async () => {
  const rows = Array.from({ length: 50 }, (_, i) => row(i + 1));
  for (const second of [
    { rows: [row()], total: 51 },
    { rows: [row(51)], total: 52 },
  ]) {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ rows, total: 51 })
      .mockResolvedValueOnce(second);
    await expect(collectAudit(read)).rejects.toThrow();
  }
});
it("allows zero and exact-limit exports but never over 10000", async () => {
  expect(await collectAudit(async () => ({ rows: [], total: 0 }))).toEqual([]);
  const result = await collectAudit(async (p) => ({
    rows: Array.from({ length: 50 }, (_, i) => row((p - 1) * 50 + i + 1)),
    total: 10000,
  }));
  expect(result).toHaveLength(10000);
  await expect(
    collectAudit(async () => ({ rows: [], total: 10001 })),
  ).rejects.toThrow("10.000");
});
it("escapes CSV formulas including leading whitespace and quotes with multiline cells", () => {
  const csv = auditCSV([
    { ...row(), actor: ' \t=HYPERLINK("test")', action: "LOGIN\nOK" },
  ]);
  expect(csv.startsWith("\ufeff")).toBe(true);
  expect(csv).toContain('"\' \t=HYPERLINK(""test"")"');
  expect(csv).toContain('"LOGIN\nOK"');
  expect(
    auditListSchema.safeParse({
      rows: Array.from({ length: 51 }, () => row()),
      total: 51,
    }).success,
  ).toBe(false);
});
