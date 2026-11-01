import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("../lib/auth/actor", () => ({ actor: vi.fn() }));
vi.mock("../lib/dashboard/counts", () => ({
  loadDashboardCounts: vi.fn().mockResolvedValue([]),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw Error("redirect:" + path);
  }),
}));
import { actor } from "../lib/auth/actor";
import { loadDashboardCounts } from "../lib/dashboard/counts";
import Dashboard from "../app/dashboard/page";
beforeEach(() => vi.clearAllMocks());
describe("dashboard page guard", () => {
  it("redirects absent and nonstaff actors before loading data", async () => {
    for (const [value, path] of [
      [null, "/login"],
      [{ role: "teacher", context: "supervisor" }, "/supervisor"],
      [{ role: "student", context: "student" }, "/student"],
      [{ role: "supervisor", context: "staff" }, "/login"],
    ] as const) {
      vi.mocked(actor).mockResolvedValue(
        value as Awaited<ReturnType<typeof actor>>,
      );
      await expect(Dashboard()).rejects.toThrow("redirect:" + path);
    }
    expect(loadDashboardCounts).not.toHaveBeenCalled();
  });
  it("passes only the valid staff role and safe totals into the overview", async () => {
    for (const role of ["admin", "teacher"]) {
      vi.mocked(actor).mockResolvedValue({ role, context: "staff" } as Awaited<
        ReturnType<typeof actor>
      >);
      const page = await Dashboard();
      expect(page.props.role).toBe(role);
      expect(page.props.counts).toEqual([]);
    }
  });
});
