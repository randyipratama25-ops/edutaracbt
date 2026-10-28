import { z } from "zod";
import { actor } from "../../../../lib/auth/actor";
import { masterSchema } from "../../../../lib/domain/validation";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../../lib/http";
export async function GET() {
  try {
    const a = await actor();
    if (!a || a.context !== "staff")
      throw new HttpError(401, "Silakan masuk sebagai staf.");
    const results = await Promise.all(
      ["classes", "subjects", "teacher_assignments", "student_enrollments"].map(
        (t) => a.client.from(t).select("*"),
      ),
    );
    for (const r of results) if (r.error) throw r.error;
    const { data: people } = await a.client
      .from("profiles")
      .select("id,full_name,role")
      .eq("active", true)
      .in("role", ["teacher", "student"])
      .limit(1000);
    return json({
      people: people || [],
      classes: results[0].data,
      subjects: results[1].data,
      assignments: results[2].data,
      enrollments: results[3].data,
      canManage: a.role === "admin",
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await actor();
    if (!a || a.role !== "admin" || a.context !== "staff")
      throw new HttpError(403, "Hanya Admin yang dapat mengelola data master.");
    const raw = await body(request);
    if (raw.kind === "assignment" || raw.kind === "enrollment") {
      const x = z
        .object({
          kind: z.enum(["assignment", "enrollment"]),
          id: z.uuid().optional(),
          user_id: z.uuid(),
          class_id: z.uuid(),
          subject_id: z.uuid().optional(),
          active: z.boolean().default(true),
        })
        .parse(raw);
      const table =
        x.kind === "assignment" ? "teacher_assignments" : "student_enrollments";
      const { data: profile } = await a.client
        .from("profiles")
        .select("role")
        .eq("id", x.user_id)
        .single();
      if (profile?.role !== (x.kind === "assignment" ? "teacher" : "student"))
        throw new HttpError(422, "Peran pengguna tidak sesuai penugasan.");
      if (x.kind === "assignment" && !x.subject_id)
        throw new HttpError(422, "Mata pelajaran wajib dipilih.");
      const fields: {
        organization_id: string;
        class_id: string;
        active: boolean;
        teacher_id?: string;
        student_id?: string;
        subject_id?: string;
      } = {
        organization_id: a.organization_id,
        class_id: x.class_id,
        active: x.active,
        ...(x.kind === "assignment"
          ? { teacher_id: x.user_id, subject_id: x.subject_id }
          : { student_id: x.user_id }),
      };
      const query = x.id
        ? a.client.from(table).update(fields).eq("id", x.id)
        : a.client.from(table).upsert(fields, {
            onConflict:
              x.kind === "assignment"
                ? "teacher_id,class_id,subject_id"
                : "student_id,class_id",
          });
      const { error } = await query.select("id").single();
      if (error)
        throw new HttpError(
          422,
          "Penugasan gagal. Periksa kelas dan mata pelajaran.",
        );
      return json({ saved: true });
    }
    const x = masterSchema.parse(raw);
    const row = {
      organization_id: a.organization_id,
      name: x.name,
      ...(x.active === undefined ? {} : { active: x.active }),
    };
    const query = x.id
      ? a.client.from(x.kind).update(row).eq("id", x.id)
      : a.client.from(x.kind).insert(row);
    const { data, error } = await query.select("id").single();
    if (error)
      throw new HttpError(
        422,
        "Data gagal disimpan. Nama mungkin sudah digunakan.",
      );
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
