import { describe, it, expect, vi } from "vitest";
import { loadDashboardCounts } from "../lib/dashboard/counts";
import type { actor } from "../lib/auth/actor";
type Actor = NonNullable<Awaited<ReturnType<typeof actor>>>;
function fixture(
  role = "admin",
  context = "staff",
  results: unknown[] = [{ count: 0 }, { count: 6 }, { count: 12 }],
) {
  const chains = results.map((r, i) => {
    const c = { select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn() };
    c.select.mockReturnValue(c);
    c.eq.mockReturnValue(c);
    c.abortSignal.mockImplementation(() =>
      i === 1 && r === null
        ? Promise.reject(Error("offline"))
        : Promise.resolve(r),
    );
    return c;
  });
  const from = vi.fn(
    (table: string) =>
      chains[["profiles", "classes", "subjects"].indexOf(table)],
  );
  return {
    a: {
      role,
      context,
      organization_id: "org",
      client: { from },
    } as unknown as Actor,
    from,
    chains,
  };
}
describe("dashboard server counts", () => {
  it("retains zero and totals, scopes each RLS query to organization with a deadline", async () => {
    const { a, chains } = fixture();
    expect(await loadDashboardCounts(a)).toEqual([
      { label: "Pengguna", count: 0 },
      { label: "Kelas", count: 6 },
      { label: "Mata pelajaran", count: 12 },
    ]);
    for (const c of chains) {
      expect(c.select).toHaveBeenCalledWith("id", {
        head: true,
        count: "exact",
      });
      expect(c.eq).toHaveBeenCalledWith("organization_id", "org");
      expect(c.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    }
  });
  it("isolates returned errors, rejected queries and absent counts instead of masking failures as zero", async () => {
    const { a } = fixture("admin", "staff", [
      { count: 132, error: { message: "private details" } },
      null,
      { count: null },
    ]);
    expect((await loadDashboardCounts(a)).map((r) => r.count)).toEqual([
      null,
      null,
      null,
    ]);
    const other = fixture("admin", "staff", [{ count: 3 }, null, { count: 9 }]);
    expect((await loadDashboardCounts(other.a)).map((r) => r.count)).toEqual([
      3,
      null,
      9,
    ]);
  });
  it("never queries admin totals for teachers or nonstaff contexts", async () => {
    for (const [role, context] of [
      ["teacher", "staff"],
      ["admin", "supervisor"],
      ["student", "student"],
    ]) {
      const { a, from } = fixture(role, context);
      expect(await loadDashboardCounts(a)).toEqual([]);
      expect(from).not.toHaveBeenCalled();
    }
  });
});
