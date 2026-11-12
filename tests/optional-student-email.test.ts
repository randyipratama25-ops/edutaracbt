import { describe, expect, it } from "vitest";
import { parseUserImport, userSchema, userCreateSchema } from "../lib/domain/validation";
import { userCommand } from "../lib/users/schema";
import { createInternalStudentEmail, isInternalStudentEmail } from "../supabase/functions/identity-gateway/student-email";

const fields = {
  username: "siswa-baru",
  full_name: "Siswa Baru",
  role: "student" as const,
  class_id: "03000000-0000-4000-8000-000000000001",
  password: "ABCDEFG2346!",
};
describe("optional student email", () => {
  it("accepts missing, empty, and valid real email for students", () => {
    for (const input of [{ ...fields }, { ...fields, email: "" }, { ...fields, email: "siswa@example.test" }]) {
      const parsed = userCreateSchema.parse(input);
      expect(parsed.email).toBe(input.email ?? "");
      expect(userCommand.safeParse({ operation: "create", ...input }).success).toBe(true);
    }
  });
  it("does not relax required email for any other role", () => {
    for (const role of ["admin", "teacher", "supervisor", "committee"]) {
      for (const email of [undefined, ""]) {
        const input = { username: "guru-baru", full_name: "Guru Baru", role, email };
        expect(userSchema.safeParse(input).success).toBe(false);
        expect(userCreateSchema.safeParse(input).success).toBe(false);
      }
      expect(userCreateSchema.safeParse({ username: "guru-baru", full_name: "Guru Baru", role, email: "guru@example.test" }).success).toBe(true);
    }
    expect(userCreateSchema.safeParse({ ...fields, email: "bukan-email" }).success).toBe(false);
  });
  it("accepts multiple student TSV imports with blank email and preserves duplicate real-email checks", () => {
    const data = parseUserImport(
      "username\tfull_name\temail\trole\tclass_id\n" +
      "siswa-a\tSiswa A\t\tstudent\t03000000-0000-4000-8000-000000000001\n" +
      "siswa-b\tSiswa B\t\tstudent\t03000000-0000-4000-8000-000000000001\n" +
      "guru-a\tGuru A\t\tteacher\t\n" +
      "siswa-c\tSiswa C\tsx@example.test\tstudent\t03000000-0000-4000-8000-000000000001\n" +
      "siswa-d\tSiswa D\tSX@example.test\tstudent\t03000000-0000-4000-8000-000000000001",
    );
    expect(data.map((x) => x.valid)).toEqual([true, true, false, true, false]);
    expect(data[0].data?.email).toBe("");
    expect(data[1].data?.email).toBe("");
    expect(data[2].error).toContain("Email");
    expect(data[4].error).toContain("Email duplikat");
  });
  it("creates unique internal Auth emails without passing them as actual contact information", () => {
    const emails = Array.from({ length: 100 }, () => createInternalStudentEmail());
    expect(new Set(emails).size).toBe(100);
    for (const email of emails) expect(isInternalStudentEmail(email)).toBe(true);
    expect(isInternalStudentEmail("siswa@example.test")).toBe(false);
    expect(isInternalStudentEmail("student-random@example.com")).toBe(false);
  });
});
