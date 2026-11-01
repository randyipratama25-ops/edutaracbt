import { actor } from "../../../../lib/auth/actor";
import { masterCommand } from "../../../../lib/master/schema";
import { loadMasterData } from "../../../../lib/master/server";
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
    if (!a || a.context !== "staff" || !["admin", "teacher"].includes(a.role))
      throw new HttpError(401, "Silakan masuk sebagai staf.");
    return json(await loadMasterData(a));
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
    const x = masterCommand.parse(await body(request));
    if ("user_id" in x) {
      const profile = await a.client
        .from("profiles")
        .select("role,active")
        .eq("id", x.user_id)
        .eq("organization_id", a.organization_id)
        .single();
      if (profile.error)
        throw new HttpError(422, "Pengguna tidak tersedia dalam organisasi.");
      if (
        profile.data?.role !== (x.kind === "assignment" ? "teacher" : "student")
      )
        throw new HttpError(422, "Peran pengguna tidak sesuai penugasan.");
      if (x.active) {
        if (!profile.data.active)
          throw new HttpError(
            422,
            "Pengguna nonaktif tidak dapat diberi penugasan aktif.",
          );
        const targets = [
          { table: "classes", id: x.class_id },
          ...(x.kind === "assignment"
            ? [{ table: "subjects", id: x.subject_id! }]
            : []),
        ];
        for (const target of targets) {
          const r = await a.client
            .from(target.table)
            .select("id,active")
            .eq("id", target.id)
            .eq("organization_id", a.organization_id)
            .single();
          if (r.error || !r.data?.active)
            throw new HttpError(
              422,
              "Pilih kelas dan mata pelajaran aktif dalam organisasi.",
            );
        }
      }
      const table =
        x.kind === "assignment" ? "teacher_assignments" : "student_enrollments";
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
        ? a.client
            .from(table)
            .update(fields)
            .eq("id", x.id)
            .eq("organization_id", a.organization_id)
        : a.client.from(table).upsert(fields, {
            onConflict:
              x.kind === "assignment"
                ? "teacher_id,class_id,subject_id"
                : "student_id,class_id",
          });
      const r = await query.select("id").single();
      if (
        (!r.error && !r.data) ||
        (r.error && (r.status === 0 || r.status >= 500))
      )
        throw new HttpError(
          503,
          "Hasil perubahan belum dapat dipastikan. Muat ulang data sebelum mencoba lagi.",
        );
      if (r.error)
        throw new HttpError(
          422,
          "Penugasan gagal. Periksa pengguna, kelas dan mata pelajaran.",
        );
      return json({ saved: true });
    }
    const fields = {
      organization_id: a.organization_id,
      name: x.name,
      ...(x.active === undefined ? {} : { active: x.active }),
    };
    const query = x.id
      ? a.client
          .from(x.kind)
          .update(fields)
          .eq("id", x.id)
          .eq("organization_id", a.organization_id)
      : a.client.from(x.kind).insert(fields);
    const r = await query.select("id").single();
    if (
      (!r.error && !r.data) ||
      (r.error && (r.status === 0 || r.status >= 500))
    )
      throw new HttpError(
        503,
        "Hasil perubahan belum dapat dipastikan. Muat ulang data sebelum mencoba lagi.",
      );
    if (r.error)
      throw new HttpError(
        422,
        "Data gagal disimpan. Nama mungkin sudah digunakan atau data tidak tersedia.",
      );
    return json(r.data);
  } catch (e) {
    return failure(e);
  }
}
