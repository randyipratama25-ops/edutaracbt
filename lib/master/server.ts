import type { actor } from "../auth/actor";
import { HttpError } from "../http";
type Actor = NonNullable<Awaited<ReturnType<typeof actor>>>;
/** Range every RLS-scoped read: PostgREST's row ceiling must not truncate reference lists. */
export async function loadMasterData(a: Actor) {
  const signal = AbortSignal.timeout(15000);
  async function all(table: string, columns = "*") {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = a.client
        .from(table)
        .select(columns)
        .eq("organization_id", a.organization_id);
      if (table === "profiles")
        query = query.in("role", ["teacher", "student"]);
      const { data, error } = await query
        .order("id")
        .range(offset, offset + 499)
        .abortSignal(signal)
        .overrideTypes<Record<string, unknown>[], { merge: false }>();
      if (error || !Array.isArray(data))
        throw new HttpError(
          503,
          "Data akademik belum dapat dimuat. Coba muat ulang.",
        );
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }
  const [classes, subjects, assignments, enrollments, people] =
    await Promise.all([
      all("classes"),
      all("subjects"),
      all("teacher_assignments"),
      all("student_enrollments"),
      all("profiles", "id,full_name,role,active"),
    ]);
  return {
    classes,
    subjects,
    assignments,
    enrollments,
    people,
    canManage: a.role === "admin",
  };
}
