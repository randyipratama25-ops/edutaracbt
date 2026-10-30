import { describe, it, expect, vi } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { evaluationSchema } from "../lib/advanced/schema";
import { pilotConfig } from "../lib/advanced/seb";
import { exchangeHeaders, exchangeRow } from "../lib/reports/exchange";
import { renderXLSX, reportHTML, renderPDF } from "../lib/reports/render";
import type { ResultDetail } from "../lib/results/types";
const id = "00000000-0000-4000-8000-000000000001";
const settings = {
  school: "MTs Uji",
  address: "Alamat pengujian",
  official: "",
  official_title: "",
  logo_media_id: null,
};
const detail = (score: number | null = 0, pending = 0): ResultDetail => ({
  attempt: {
    id,
    exam_id: id,
    student_id: id,
    student: "=SUM(1,2)",
    title: "Ujian pertukaran nilai",
    status: "submitted",
    revision: 4,
    score,
    passed: false,
    pending,
    class_ids: [id],
    class_name: "VII A",
    started_at: "2026-10-30T00:00:00Z",
    finalized_at: "2026-10-30T01:00:00Z",
  },
  questions: [],
  history: [],
  ledger: [],
  suggestions: [],
});
describe("controlled advanced features", () => {
  it("keeps the SEB pilot on trusted HTTPS origins and offers an exit", () => {
    const xml = pilotConfig("https://edutara-cbt-ashen.vercel.app");
    expect(xml).toContain(
      "<key>startURL</key><string>https://edutara-cbt-ashen.vercel.app/login</string>",
    );
    expect(xml).toContain("<key>allowQuit</key><true/>");
    expect(xml).toContain("<key>sendBrowserExamKey</key><false/>");
    expect(xml).not.toMatch(/password|token=|secret/i);
  });
  it.each([
    "http://edutara-cbt-ashen.vercel.app",
    "https://other.vercel.app",
    "https://edutara-cbt-ashen.vercel.app/evil",
    "https://user:pass@edutara-cbt-ashen.vercel.app",
    "https://edutara-cbt-ashen.vercel.app?token=x",
  ])("rejects unsafe pilot origin %s", (url) =>
    expect(() => pilotConfig(url)).toThrow(),
  );
  it("requires all six boolean observations and prevents token-bearing evidence URLs", () => {
    const v = {
      action: "record",
      request_id: id,
      candidate_sha: "a".repeat(40),
      platform: "Windows",
      device_label: "Lab 01",
      seb_version: "3.x observed",
      checks: {
        login: true,
        questions: true,
        media: true,
        canvas: false,
        recovery: false,
        submit: true,
      },
      notes: "Actual tests not fully passed",
      evidence_ref: "uat/lab-01/report.pdf",
    };
    expect(evaluationSchema.safeParse(v).success).toBe(true);
    expect(
      evaluationSchema.safeParse({
        ...v,
        evidence_ref: "https://x.invalid?token=x",
      }).success,
    ).toBe(false);
    expect(
      evaluationSchema.safeParse({ ...v, checks: { login: true } }).success,
    ).toBe(false);
  });
  it("exports final zero while leaving provisional and disqualified scores empty", () => {
    expect(exchangeRow(detail())[9]).toBe(0);
    expect(exchangeRow(detail(40, 1))[9]).toBeNull();
    const d = detail(90);
    d.attempt.status = "disqualified";
    expect(exchangeRow(d)[9]).toBeNull();
  });
  it("writes stable headers, IDs/revisions, final zero and safe text into XLSX", async () => {
    const bytes = await renderXLSX(
      [detail(), detail(50, 1)],
      "exchange",
      settings,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0],
    );
    const s = wb.worksheets[0];
    expect(s.getRow(4).values).toEqual([, ...exchangeHeaders]);
    expect(s.getCell("J5").value).toBe(0);
    expect(s.getCell("J6").value).toBeNull();
    expect(s.getCell("A5").value).toBe(id);
    expect(s.getCell("G5").value).toBe(4);
    expect(s.getCell("B5").type).not.toBe(ExcelJS.ValueType.Formula);
    expect(wb.worksheets[1].name).toBe("Panduan");
  });
  it("uses the same data mapping in PDF HTML with escaped names", async () => {
    const d = detail();
    d.attempt.student = "<script>Bad</script>";
    const html = await reportHTML([d], "exchange", settings);
    expect(html).toContain("edutara-grade-exchange-v1");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("A4 landscape");
    expect(html).toContain("ID Attempt");
  });
  it.skipIf(!process.env.STAGE6_PDF_QA)(
    "renders a multi-page landscape exchange PDF",
    async () => {
      const bytes = await renderPDF(
        Array.from({ length: 60 }, (_, i) => {
          const d = detail(i);
          d.attempt.student = "Peserta uji " + i;
          return d;
        }),
        "exchange",
        settings,
      );
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBeGreaterThan(1);
      expect(pdf.getPage(0).getWidth()).toBeGreaterThan(
        pdf.getPage(0).getHeight(),
      );
      await mkdir("/tmp/edutara-s6-pdf", { recursive: true });
      await writeFile("/tmp/edutara-s6-pdf/exchange.pdf", bytes);
    },
    120000,
  );
});
const staff = vi.fn();
vi.mock("../lib/results/server", () => ({ staff: () => staff() }));
import { POST as ai } from "../app/api/grading/ai/route";
import { GET as advanced, POST as record } from "../app/api/advanced/route";
describe("advanced API boundaries", () => {
  it("rejects Teachers and cross-origin writes before invoking the database", async () => {
    const rpc = vi.fn();
    staff.mockResolvedValue({ role: "teacher", client: { rpc } });
    expect(
      (await advanced(new Request("https://app.invalid/api/advanced"))).status,
    ).toBe(403);
    expect(
      (
        await record(
          new Request("https://app.invalid/api/advanced", {
            method: "POST",
            headers: { origin: "https://other.invalid" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps AI requests disabled without calling any provider or database", async () => {
    const rpc = vi.fn();
    staff.mockResolvedValue({ role: "admin", client: { rpc } });
    const r = await ai(
      new Request("https://app.invalid/api/grading/ai", {
        method: "POST",
        headers: { origin: "https://app.invalid" },
        body: JSON.stringify({
          request_id: id,
          items: [{ attempt_id: id, question_id: id }],
        }),
      }),
    );
    expect(r.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
});
