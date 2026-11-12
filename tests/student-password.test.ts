import { describe, expect, it } from "vitest";
import { generateStudentPassword, isStudentPassword } from "../lib/users/student-password";
import { studentPasswordSchema, userCreateSchema } from "../lib/domain/validation";

const details = {
  username: "siswa-baru",
  full_name: "Siswa Baru",
  email: "siswa@example.test",
  role: "student" as const,
  class_id: "03000000-0000-4000-8000-000000000001",
};

describe("student provisioning password policy", () => {
  it("generates 1000 policy-compliant, distinct cryptographic passwords", () => {
    const values = Array.from({ length: 1000 }, () => generateStudentPassword());
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toHaveLength(12);
      expect(isStudentPassword(value)).toBe(true);
      expect(studentPasswordSchema.safeParse(value).success).toBe(true);
    }
  });
  it("rejects ambiguous characters, lowercase, wrong symbol position and missing classes", () => {
    for (const value of [
      "ABCDEFG2345!", // forbidden 5
      "ABCDOFG2346!", // forbidden O
      "ABCDIFG2346!", // forbidden I
      "ABCDSFG2346!", // forbidden S
      "abcdEFG2346!", // lowercase
      "!ABCDEFG2346", // symbol not final
      "ABCDEFG2346!!", // two symbols
      "ABCDEFGHJKL!", // missing digit
      "23467892346!", // missing letter
      "ABCDEFG2346%", // disallowed symbol
      "ABCDEFG2346", // 11 chars
    ]) expect(studentPasswordSchema.safeParse(value).success).toBe(false);
  });
  it("requires password for student only, never accepts one for staff", () => {
    const password = generateStudentPassword();
    expect(userCreateSchema.safeParse({ ...details, password }).success).toBe(true);
    expect(userCreateSchema.safeParse(details).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...details, password: "bad" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...details, role: "teacher" }).success).toBe(true);
    expect(userCreateSchema.safeParse({ ...details, role: "teacher", password }).success).toBe(false);
  });
});
