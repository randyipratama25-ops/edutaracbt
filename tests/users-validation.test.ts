import { describe, it, expect } from "vitest";
import { parseUserImport } from "../lib/domain/validation";
import {
  userListSchema,
  invitationSchema,
  tsvLink,
  userCommand,
} from "../lib/users/schema";
const id = "03000000-0000-4000-8000-000000000001";
describe("users validation and export", () => {
  it("flags duplicate email case-insensitively, username duplicates and wrong TSV column counts", () => {
    const r = parseUserImport(
      "user-1\tNama\tu@example.test\tteacher\nuser-2\tNama\tU@example.test\tteacher\nuser-1\tNama\tx@example.test\tteacher\nuser-4\tNama\ty@example.test\tteacher\t\textra",
    );
    expect(r.map((x) => x.valid)).toEqual([true, false, false, false]);
    expect(r[1].error).toContain("Email duplikat");
    expect(r[2].error).toContain("Username duplikat");
    expect(r[3].error).toContain("kolom");
  });
  it("keeps optional class IDs for admin imports and empty/header-only files", () => {
    expect(
      parseUserImport(
        "username\tfull_name\temail\trole\tclass_id\nguru-1\tGuru\tg@example.test\tteacher\t",
      )[0].valid,
    ).toBe(true);
    expect(parseUserImport("")).toEqual([]);
    expect(
      parseUserImport("username\tfull_name\temail\trole\tclass_id"),
    ).toEqual([]);
  });
  it("requires valid counts, rows and teacher list scope instead of rendering malformed payloads", () => {
    for (const data of [
      { rows: null, count: 0, canManage: true },
      { rows: [], count: null, canManage: true },
      { rows: [], count: -1, canManage: true },
      {
        rows: [
          {
            id,
            username: "guru1",
            full_name: "Guru",
            role: "teacher",
            active: true,
          },
        ],
        count: 1,
        canManage: false,
      },
    ])
      expect(userListSchema.safeParse(data).success).toBe(false);
    expect(
      userListSchema.parse({ rows: [], count: 0, canManage: false }).count,
    ).toBe(0);
  });
  it("validates invitation readiness and strips unrelated fields from mutations", () => {
    expect(
      invitationSchema.safeParse({
        email: "invalid",
        eligible: true,
        reason: "",
      }).success,
    ).toBe(false);
    expect(
      userCommand.parse({
        operation: "update",
        id,
        full_name: "Guru",
        role: "admin",
        action: "login",
      }),
    ).toEqual({ operation: "update", id, full_name: "Guru" });
  });
  it("neutralizes spreadsheet formulas and separators without altering application data", () => {
    const encoded = tsvLink([
      ["id", "nama"],
      [id, "=IMPORTXML(1)"],
      ["row", " +SUM(1)\t\n"],
    ]);
    const text = decodeURIComponent(encoded.split(",")[1]);
    expect(text).toContain("\t'=IMPORTXML(1)");
    expect(text).toContain("\t' +SUM(1)  ");
    expect(text.split("\n")).toHaveLength(3);
  });
});
