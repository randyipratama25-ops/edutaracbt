import { z } from "zod";
export const roles = ["admin", "teacher", "supervisor", "student"] as const;
export const contexts = ["staff", "supervisor", "student"] as const;
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
  email: z.email(),
  role: z.enum(roles),
  class_id: z.uuid().optional(),
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
  return lines.map((line, index) => {
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
    const duplicate = result.success && seen.has(result.data.username);
    if (result.success) seen.add(result.data.username);
    return {
      row: index + (hasHeader ? 2 : 1),
      valid: result.success && !duplicate,
      data: result.success ? result.data : null,
      error: duplicate ? "Username duplikat dalam berkas." : result.success
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
      : context === "student" && role === "student";
}
export function safeNext(value: string | null) {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
    ? value
    : "/dashboard";
}
