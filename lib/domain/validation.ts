import { z } from "zod";
import { isStudentPassword } from "../users/student-password";
export const roles = ["admin", "teacher", "supervisor", "committee", "student"] as const;
export const contexts = ["staff", "supervisor", "committee", "student"] as const;
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9_.-]{2,63}$/,
    "Username 3–64 karakter: huruf kecil, angka, titik, garis bawah atau tanda hubung.",
  );
export const loginSchema = z.object({
  username,
  password: z.string().min(1).max(256),
  context: z.enum(contexts),
  pin: z.string().max(32).optional(),
});
export const userSchema = z.object({
  username,
  full_name: z.string().trim().min(1).max(150),
  email: z.union([z.email(), z.literal("")]).default(""),
  role: z.enum(roles),
  class_id: z.uuid().optional(),
}).superRefine((value, context) => {
  if (value.role !== "student" && !value.email)
    context.addIssue({ code: "custom", path: ["email"], message: "Email wajib diisi untuk akun selain siswa." });
});
export const studentPasswordSchema = z.string().refine(isStudentPassword, "Password harus 12 karakter: 11 huruf kapital/angka tanpa O,I,S,0,1,5 dan satu simbol !@#$*? di akhir.");
export const userCreateSchema = userSchema.safeExtend({ password: studentPasswordSchema.optional() }).superRefine((value, context) => {
  if (value.role === "student" && !value.password)
    context.addIssue({ code: "custom", path: ["password"], message: "Password siswa wajib diisi oleh Admin." });
  if (value.role !== "student" && value.password !== undefined)
    context.addIssue({ code: "custom", path: ["password"], message: "Password langsung hanya untuk siswa." });
});
export const masterSchema = z.object({
  kind: z.enum(["classes", "subjects"]),
  name: z.string().trim().min(1).max(100),
  id: z.uuid().optional(),
  active: z.boolean().optional(),
});
export function parseUserImport(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const hasHeader = lines[0]?.startsWith("username\t");
  if (hasHeader) lines.shift();
  if (lines.length > 200) throw new Error("Maksimal 200 baris per impor.");
  if (!text.trim()) return [];
  const seen = new Set<string>();
  const emails = new Set<string>();
  return lines.map((line, index) => {
    const columns = line.split("\t");
    const [username, full_name, email, role, class_id] = line
      .split("\t")
      .map((v) => v.trim());
    const result = userSchema.safeParse({
      username,
      full_name,
      email,
      role,
      ...(class_id ? { class_id } : {}),
    });
    const columnError = columns.length < 4 || columns.length > 5;
    const duplicate = result.success && seen.has(result.data.username);
    const emailDuplicate =
      result.success && !!result.data.email && emails.has(result.data.email.toLowerCase());
    if (result.success && !columnError) {
      seen.add(result.data.username);
      if (result.data.email) emails.add(result.data.email.toLowerCase());
    }
    return {
      row: index + (hasHeader ? 2 : 1),
      valid: result.success && !duplicate && !emailDuplicate && !columnError,
      data: result.success ? result.data : null,
      error: columnError
        ? "Gunakan 4–5 kolom sesuai template TSV."
        : duplicate
          ? "Username duplikat dalam berkas."
          : emailDuplicate
            ? "Email duplikat dalam berkas."
            : result.success
              ? ""
              : result.error.issues
                  .map((i) => `${i.path.join(".")}: ${i.message}`)
                  .join("; "),
    };
  });
}
export function canUseContext(
  role: string,
  context: string,
  assigned: boolean,
) {
  return context === "staff"
    ? role === "admin" || role === "teacher"
    : context === "supervisor"
      ? (role === "supervisor" || role === "teacher") && assigned
      : context === "committee"
        ? role === "committee" || role === "teacher"
        : context === "student" && role === "student";
}
export function safeNext(value: string | null) {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
    ? value
    : "/dashboard";
}
