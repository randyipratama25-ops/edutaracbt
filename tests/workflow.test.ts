import { describe, expect, it } from "vitest";
import { workflowCommand } from "../lib/workflow/schema";
import { parseUserImport } from "../lib/domain/validation";
import { previewImport, templates } from "../lib/authoring/imports";
const id = "03000000-0000-4000-8000-000000000001";
describe("workflow request boundaries and import preparation", () => {
  it("requires explicit confirmation and a bounded time allowance", () => {
    const base = {
      action: "extend",
      attempt_id: id,
      version: 1,
      request_id: id,
      minutes: 5,
      reason: "Gangguan jaringan",
      confirmation: "TAMBAH WAKTU",
    };
    expect(workflowCommand.safeParse(base).success).toBe(true);
    for (const changed of [
      { minutes: 0 },
      { minutes: 61 },
      { reason: "" },
      { version: 0 },
      { confirmation: "" },
    ])
      expect(workflowCommand.safeParse({ ...base, ...changed }).success).toBe(
        false,
      );
  });
  it("validates messages and publication independently", () => {
    expect(
      workflowCommand.safeParse({
        action: "help",
        attempt_id: id,
        request_id: id,
        message: "Kendala gambar soal",
      }).success,
    ).toBe(true);
    expect(
      workflowCommand.safeParse({
        action: "help",
        attempt_id: id,
        request_id: id,
        message: "",
      }).success,
    ).toBe(false);
    expect(
      workflowCommand.safeParse({
        action: "publish",
        exam_id: id,
        request_id: id,
        confirmation: "PUBLIKASIKAN",
      }).success,
    ).toBe(true);
  });
  it("detects normalized duplicate usernames without losing line numbers", () => {
    const rows = parseUserImport(
      "username\tfull_name\temail\trole\tclass_id\nSiswa-001\tSiswa Satu\tsatu@example.com\tstudent\n siswa-001 \tSiswa Dua\tdua@example.com\tstudent",
    );
    expect(rows.map((r) => r.row)).toEqual([2, 3]);
    expect(rows[0].valid).toBe(true);
    expect(rows[1].valid).toBe(false);
    expect(rows[1].error).toContain("duplikat");
    expect(parseUserImport(" ")).toEqual([]);
  });
  it("detects duplicate questions before persistence", () => {
    const rows = previewImport(
      JSON.stringify([templates.PG, templates.PG, templates.Esai]),
    );
    expect(rows[0].question).toBeDefined();
    expect(rows[1].error).toContain("duplikat");
    expect(rows[2].question).toBeDefined();
  });
});
