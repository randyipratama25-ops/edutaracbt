import { describe, it, expect } from "vitest";
import {
  masterDataSchema,
  previewMasterBulk,
  relationCommand,
} from "../lib/master/schema";
const id = "03000000-0000-4000-8000-000000000001";
describe("master client contracts", () => {
  it("preserves bulk line numbers and skips duplicates against archived/existing names", () => {
    const r = previewMasterBulk("\n VII A \nVII B\nvii b\n" + "x".repeat(101), [
      { id, name: "vii a", active: false },
    ]);
    expect(r.map((x) => x.line)).toEqual([2, 3, 4, 5]);
    expect(r.map((x) => !!x.error)).toEqual([true, false, true, true]);
  });
  it("bounds bulk size before any mutation and handles empty input", () => {
    expect(previewMasterBulk(" \n", [])).toEqual([]);
    expect(() =>
      previewMasterBulk(
        Array.from({ length: 101 }, (_, i) => "Kelas " + i).join("\n"),
        [],
      ),
    ).toThrow("100");
  });
  it("rejects malformed snapshots rather than rendering null lists", () => {
    expect(masterDataSchema.safeParse({ classes: null }).success).toBe(false);
    expect(
      masterDataSchema.parse({
        classes: [],
        subjects: [],
        people: [],
        assignments: [],
        enrollments: [],
        canManage: false,
      }).canManage,
    ).toBe(false);
  });
  it("requires a subject for teacher assignments and keeps enrollment shape", () => {
    expect(
      relationCommand.safeParse({
        kind: "assignment",
        user_id: id,
        class_id: id,
      }).success,
    ).toBe(false);
    expect(
      relationCommand.parse({ kind: "enrollment", user_id: id, class_id: id }),
    ).toMatchObject({ active: true });
  });
});
