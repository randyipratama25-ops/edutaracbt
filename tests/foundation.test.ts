import { describe, it, expect } from "vitest";
import {
  canUseContext,
  loginSchema,
  parseUserImport,
  safeNext,
  userSchema,
} from "../lib/domain/validation";
describe("authentication boundaries", () => {
  it("permits only role-specific contexts", () => {
    expect(canUseContext("student", "staff", true)).toBe(false);
    expect(canUseContext("admin", "supervisor", true)).toBe(false);
    expect(canUseContext("teacher", "supervisor", false)).toBe(false);
    expect(canUseContext("teacher", "supervisor", true)).toBe(true);
    expect(canUseContext("supervisor", "supervisor", false)).toBe(false);
  });
  it("normalizes username without accepting injected filters", () => {
    expect(
      loginSchema.parse({
        username: " Guru_1 ",
        password: "test",
        context: "staff",
      }).username,
    ).toBe("guru_1");
    expect(
      userSchema.safeParse({
        username: "a),role.eq.admin",
        full_name: "A",
        email: "a@b.test",
        role: "student",
      }).success,
    ).toBe(false);
  });
  it("rejects external redirects", () => {
    expect(safeNext("//evil.test")).toBe("/dashboard");
    expect(safeNext("https://evil.test")).toBe("/dashboard");
    expect(safeNext("/dashboard/users")).toBe("/dashboard/users");
  });
});
describe("import preview", () => {
  it("preserves valid and invalid per-row feedback", () => {
    const r = parseUserImport(
      "username\tfull_name\temail\trole\tclass_id\nguru1\tGuru Satu\tguru@example.test\tteacher\t\nsiswa1\tSiswa Satu\tinvalid\tstudent\t",
    );
    expect(r).toHaveLength(2);
    expect(r[0].valid).toBe(true);
    expect(r[1].valid).toBe(false);
    expect(r[1].error).toContain("email");
  });
  it("rejects more than 200 rows before writes", () => {
    expect(() =>
      parseUserImport(Array(201).fill("x\tx\tx\tx").join("\n")),
    ).toThrow("200");
  });
});
