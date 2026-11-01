import type { actor } from "../auth/actor";
export const countSources = [
  { table: "profiles", label: "Pengguna" },
  { table: "classes", label: "Kelas" },
  { table: "subjects", label: "Mata pelajaran" },
] as const;
export type SummaryCount = { label: string; count: number | null };
export async function loadDashboardCounts(
  a: NonNullable<Awaited<ReturnType<typeof actor>>>,
): Promise<SummaryCount[]> {
  if (a.context !== "staff" || a.role !== "admin") return [];
  return Promise.all(
    countSources.map(async ({ table, label }) => {
      try {
        // Keep the original totals (including inactive records), scoped by the same RLS client.
        const { count, error } = await a.client
          .from(table)
          .select("id", { head: true, count: "exact" })
          .eq("organization_id", a.organization_id)
          .abortSignal(AbortSignal.timeout(15000));
        return {
          label,
          count:
            !error &&
            typeof count === "number" &&
            Number.isSafeInteger(count) &&
            count >= 0
              ? count
              : null,
        };
      } catch {
        return { label, count: null };
      }
    }),
  );
}
