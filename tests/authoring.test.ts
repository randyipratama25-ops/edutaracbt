import { describe, it, expect } from "vitest";
import {
  questionSchema,
  safeHtml,
  studentQuestion,
} from "../lib/authoring/schema";
import { previewImport, templates } from "../lib/authoring/imports";
import { fromGoogleExport } from "../lib/authoring/google-export";
describe("authoring boundaries", () => {
  it.each(Object.keys(templates))("validates %s template", (type) => {
    expect(questionSchema.safeParse(templates[type]).success).toBe(true);
  });
  it("rejects arbitrary option keys and duplicate IDs", () => {
    const q = questionSchema.parse(templates.PG);
    expect(questionSchema.safeParse({ ...q, key: ["Z"] }).success).toBe(false);
    expect(
      questionSchema.safeParse({ ...q, options: [q.options[0], q.options[0]] })
        .success,
    ).toBe(false);
  });
  it("supports sixth option F without position-based key", () => {
    const q = questionSchema.parse(templates.PG);
    expect(
      questionSchema.parse({
        ...q,
        options: "ABCDEF".split("").map((id) => ({ id, text: id })),
        key: ["F"],
      }).key,
    ).toEqual(["F"]);
  });
  it("sanitizes attributes, scripts, SVG and unsafe links", () => {
    const html = safeHtml(
      '<p onclick="evil()">x</p><script>alert(1)</script><img src=x onerror=evil()><svg/onload=evil()><b>ok</b>',
    );
    expect(html).not.toMatch(/<script|<img|<svg|onclick|onerror/);
    expect(html).toContain("<b>ok</b>");
  });
  it("does not expose grading data in student DTO", () => {
    const dto = studentQuestion(questionSchema.parse(templates.PG));
    expect(dto).not.toHaveProperty("key");
    expect(dto).not.toHaveProperty("rubric");
    expect(dto).not.toHaveProperty("explanation");
  });
  it("accepts exactly 500 and rejects 501 before submission", () => {
    expect(
      previewImport(JSON.stringify(Array(500).fill(templates.PG))),
    ).toHaveLength(500);
    expect(() =>
      previewImport(JSON.stringify(Array(501).fill(templates.PG))),
    ).toThrow("500");
  });
  it("numbers invalid and valid blocks", () => {
    const r = previewImport(
      "1. Question\nA. One\nB. Two\nKUNCI: A\n---\nInvalid",
    );
    expect(r[0].question?.key).toEqual(["A"]);
    expect(r[1].block).toBe(2);
    expect(r[1].error).toBeTruthy();
  });
  it("converts explicit Forms file keys into option IDs", () => {
    const q = fromGoogleExport({
      items: [
        {
          title: "Question",
          questionItem: {
            question: {
              choiceQuestion: {
                type: "RADIO",
                options: [{ value: "One" }, { value: "Two" }],
              },
              grading: { correctAnswers: { answers: [{ value: "Two" }] } },
            },
          },
        },
      ],
    });
    expect(questionSchema.parse(q[0]).key).toEqual(["o2"]);
  });
});
describe("legacy multi-type adapters", () => {
  it("parses legacy blank-line blocks, BS, matching distractors and essay metadata", () => {
    const rows = previewImport(
      "Tipe: BS\nTentukan kebenaran\nPernyataan:\nAir membeku | Benar\nApi dingin | Salah\n\nTipe: JODOH\nPasangkan negara\nPasangan:\nIndonesia = Jakarta\nJepang → Tokyo\nPengecoh:\nBandung\n\nTipe: Esai\nJelaskan internet\nRubrik: Ketepatan konsep\nMinKarakter: 20\nKataKunci: jaringan, komputer\nWajib: false",
    );
    expect(rows.every((r) => !r.error)).toBe(true);
    expect(rows[0].question?.key).toEqual(["true", "false"]);
    expect(rows[1].question?.distractors).toEqual(["Bandung"]);
    expect(rows[2].question?.keywords).toEqual(["jaringan", "komputer"]);
    expect(rows[2].question?.required).toBe(false);
  });
  it("preserves invalid block numbers and rejects malformed pairs", () => {
    const r = previewImport("Tipe: JODOH\nQuestion\nPasangan:\nInvalid pair");
    expect(r[0].error).toContain("Pasangan");
  });
  it("roundtrips Excel JSON cells without formula execution", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Soal");
    sheet.addRow(["question_json"]);
    sheet.addRow([JSON.stringify(templates.PG)]);
    const bytes = await wb.xlsx.writeBuffer();
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.load(bytes);
    expect(
      previewImport("[" + reread.worksheets[0].getCell("A2").text + "]")[0]
        .question?.type,
    ).toBe("PG");
  });
});
