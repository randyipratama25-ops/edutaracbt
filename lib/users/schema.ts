import { z } from "zod";
import { roles, userSchema } from "../domain/validation";
export const roleLabels: Record<string, string> = {
  admin: "Admin",
  teacher: "Guru",
  supervisor: "Pengawas",
  student: "Siswa",
};
export const userRowSchema = z.object({
  id: z.uuid(),
  username: z.string().min(1),
  full_name: z.string().min(1),
  role: z.enum(roles),
  active: z.boolean(),
  archived_at: z.string().nullable().optional(),
});
export type UserRow = z.infer<typeof userRowSchema>;
export const userListSchema = z
  .object({
    rows: z.array(userRowSchema).max(20),
    count: z.number().int().nonnegative().safe(),
    page: z.number().int().min(1).optional(),
    canManage: z.boolean(),
  })
  .superRefine((d, c) => {
    if (!d.canManage && d.rows.some((r) => r.role !== "student"))
      c.addIssue({ code: "custom", message: "Cakupan pengguna tidak valid." });
  });
export const classesSchema = z.object({
  classes: z.array(
    z.object({ id: z.uuid(), name: z.string().min(1), active: z.boolean() }),
  ),
});
export const invitationSchema = z.object({
  email: z.union([z.email(), z.literal("")]),
  eligible: z.boolean(),
  reason: z.string().max(1000),
});
export const sentSchema = z.object({
  sent: z.literal(true),
  message: z.string().min(1).max(1000),
});
export const createdSchema = z.object({
  id: z.uuid(),
  username: z.string().min(1),
});
export const savedSchema = z.object({ saved: z.literal(true) });
export const previewSchema = z.array(
  z.object({ username: z.string(), error: z.string().max(1000) }),
);
export const userCommand = z.discriminatedUnion("operation", [
  userSchema.extend({ operation: z.literal("create") }),
  z
    .object({
      operation: z.literal("update"),
      id: z.uuid(),
      full_name: z.string().trim().min(1).max(150).optional(),
      active: z.boolean().optional(),
    })
    .refine(
      (d) => d.full_name !== undefined || d.active !== undefined,
      "Tidak ada perubahan yang dikirim.",
    ),
  z.object({ operation: z.literal("archive"), id: z.uuid() }),
  z.object({
    operation: z.enum(["invitation_info", "resend_invitation"]),
    id: z.uuid(),
  }),
]);
export function tsvCell(value: unknown) {
  const text = String(value ?? "").replace(/[\t\r\n]/g, " ");
  return /^\s*[=+@-]/.test(text) ? "'" + text : text;
}
export function tsvLink(rows: unknown[][]) {
  return (
    "data:text/tab-separated-values;charset=utf-8," +
    encodeURIComponent(rows.map((r) => r.map(tsvCell).join("\t")).join("\n"))
  );
}
