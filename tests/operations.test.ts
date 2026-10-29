import { describe, it, expect } from "vitest";
import { validateMedia, readBounded } from "../lib/operations/media";
import { operation, cardCreate } from "../lib/operations/schema";
import { cardHTML, type CardSnapshot } from "../lib/operations/cards";
import { renderPDF } from "../lib/reports/render";
import { writeFile, mkdir } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
const id = "63000000-0000-4000-8000-000000000005";
const snapshot: CardSnapshot = {
  settings: {
    school: "MTs Nurul Falah",
    address: "Alamat uji",
    official: "Kepala Madrasah",
    official_title: "Penanggung jawab",
    logo_media_id: null,
  },
  exam: {
    id,
    title: "Ujian Informatika",
    starts_at: "2026-10-29T00:00:00Z",
    ends_at: "2026-10-29T02:00:00Z",
  },
  students: [
    { id, name: "محمد — Peserta Uji", username: "siswa-001", room: "Ruang A" },
  ],
};
describe("operational security boundaries", () => {
  it("requires reset reason, explicit confirmation and CAS version", () => {
    const input = {
      action: "reset",
      request_id: id,
      attempts: [{ id, version: 2 }],
      reason: "Reset uji coba",
      confirmation: "KONFIRMASI",
    };
    expect(operation.parse(input)).toMatchObject(input);
    expect(() => operation.parse({ ...input, confirmation: "" })).toThrow();
    expect(() => operation.parse({ ...input, attempts: [{ id }] })).toThrow();
    expect(() => operation.parse({ ...input, reason: "x" })).toThrow();
  });
  it("retains zero room capacity and validates card recipient limits", () => {
    expect(
      operation.parse({
        action: "room_save",
        request_id: id,
        exam_id: id,
        name: "A",
        capacity: 0,
      }),
    ).toHaveProperty("capacity", 0);
    expect(() =>
      cardCreate.parse({
        action: "create",
        request_id: id,
        exam_id: id,
        student_ids: [],
        format: "pdf",
        template: "compact",
      }),
    ).toThrow();
  });
  it("distinguishes WAV from WebP despite shared RIFF header and checksums bytes", () => {
    const wave = new TextEncoder().encode("RIFF1234WAVEabcdefghijkl");
    expect(validateMedia(wave, "audio/wav")).toMatch(/^[a-f0-9]{64}$/);
    expect(() => validateMedia(wave, "image/webp")).toThrow();
    expect(() => validateMedia(new Uint8Array(0), "image/png")).toThrow();
  });
  it("cancels an oversized byte stream before buffering all input", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(10));
        c.enqueue(new Uint8Array(10));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(readBounded(stream, 15)).rejects.toThrow("batas");
    expect(cancelled).toBe(true);
  });
  it("prints escaped identity and username without password or PIN values", async () => {
    const html = await cardHTML(
      {
        ...snapshot,
        students: [{ ...snapshot.students[0], name: "<script>bad()</script>" }],
      },
      "compact",
      "https://example.invalid/login",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("siswa-001");
    expect(html).not.toContain("887766");
    expect(html).toContain("07.00");
  });
  it.skipIf(!process.env.STAGE5_PDF_QA)(
    "renders multi-page cards with Arabic identity and final recipient",
    async () => {
      const s = {
        ...snapshot,
        students: Array.from({ length: 15 }, (_, i) => ({
          ...snapshot.students[0],
          id: String(i),
          name: "محمد — Peserta Uji " + (i + 1),
          username: "siswa-" + (i + 1),
        })),
      };
      const html = await cardHTML(
        s,
        "compact",
        "https://example.invalid/login",
      );
      const bytes = await renderPDF([], "student", s.settings, undefined, html);
      expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
      await mkdir("/tmp/stage5-qa", { recursive: true });
      await writeFile("/tmp/stage5-qa/cards.pdf", bytes);
    },
    120000,
  );
});
