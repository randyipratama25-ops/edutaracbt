import { z } from "zod";
import { masterSchema } from "../domain/validation";
export const masterRow = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  active: z.boolean(),
});
export const personRow = z.object({
  id: z.uuid(),
  full_name: z.string().min(1),
  role: z.enum(["teacher", "student"]),
  active: z.boolean().optional(),
});
export const assignmentRow = z.object({
  id: z.uuid(),
  teacher_id: z.uuid(),
  class_id: z.uuid(),
  subject_id: z.uuid(),
  active: z.boolean(),
});
export const enrollmentRow = z.object({
  id: z.uuid(),
  student_id: z.uuid(),
  class_id: z.uuid(),
  active: z.boolean(),
});
export const masterDataSchema = z.object({
  classes: z.array(masterRow),
  subjects: z.array(masterRow),
  assignments: z.array(assignmentRow),
  enrollments: z.array(enrollmentRow),
  people: z.array(personRow),
  canManage: z.boolean(),
});
export type MasterData = z.infer<typeof masterDataSchema>;
export type Master = z.infer<typeof masterRow>;
export type MasterKind = "classes" | "subjects";
export const relationCommand = z
  .object({
    kind: z.enum(["assignment", "enrollment"]),
    id: z.uuid().optional(),
    user_id: z.uuid(),
    class_id: z.uuid(),
    subject_id: z.uuid().optional(),
    active: z.boolean().default(true),
  })
  .superRefine((v, c) => {
    if (v.kind === "assignment" && !v.subject_id)
      c.addIssue({
        code: "custom",
        path: ["subject_id"],
        message: "Mata pelajaran wajib dipilih.",
      });
  });
export const masterCommand = z.union([relationCommand, masterSchema]);
export const masterSaved = z.object({ id: z.uuid() });
export const relationSaved = z.object({ saved: z.literal(true) });
export type BulkRow = { line: number; name: string; error: string };
export function previewMasterBulk(text: string, existing: Master[]): BulkRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((name, i) => ({ name: name.trim(), line: i + 1 }))
    .filter((r) => r.name);
  if (lines.length > 100) throw Error("Maksimal 100 nama per proses.");
  const seen = new Set(existing.map((x) => x.name.trim().toLowerCase()));
  return lines.map((row) => {
    const key = row.name.toLowerCase(),
      error =
        row.name.length > 100
          ? "Nama maksimal 100 karakter."
          : seen.has(key)
            ? "Nama duplikat atau sudah tersedia."
            : "";
    if (!error) seen.add(key);
    return { ...row, error };
  });
}
