import { parseLegacyBlock } from "./legacy";
import { questionSchema, type Question } from "./schema";
export type Preview = { block: number; question?: Question; error?: string };
export function previewImport(text: string): Preview[] {
  let rows: unknown[];
  try {
    const value: unknown = JSON.parse(text);
    rows = Array.isArray(value) ? value : [value];
  } catch {
    rows = text
      .trim()
      .split(/\n\s*---+\s*\n|\r?\n\s*\r?\n+/)
      .filter(Boolean)
      .map((block) => {
        try {
          return parseLegacyBlock(block);
        } catch (e) {
          return {
            parseError: e instanceof Error ? e.message : "Blok tidak valid.",
          };
        }
      });
  }
  if (rows.length > 500) throw Error("Maksimal 500 soal per permintaan.");
  return rows.map((r, i) => {
    if (r && typeof r === "object" && "parseError" in r)
      return { block: i + 1, error: String(r.parseError) };
    const v = questionSchema.safeParse(r);
    return v.success
      ? { block: i + 1, question: v.data }
      : {
          block: i + 1,
          error: v.error.issues.map((x) => x.message).join("; "),
        };
  });
}
export const templates: Record<string, unknown> = {
  PG: {
    type: "PG",
    stem: "Pilih jawaban yang benar.",
    points: 1,
    options: [
      { id: "A", text: "Pilihan pertama" },
      { id: "B", text: "Pilihan kedua" },
    ],
    key: ["A"],
  },
  PG_KOMPLEKS: {
    type: "PG_KOMPLEKS",
    stem: "Pilih semua jawaban benar.",
    points: 2,
    options: [
      { id: "A", text: "Pilihan pertama" },
      { id: "B", text: "Pilihan kedua" },
    ],
    key: ["A", "B"],
  },
  BS: {
    type: "BS",
    stem: "Tentukan benar atau salah.",
    points: 2,
    options: [{ id: "s1", text: "Pernyataan pertama" }],
    key: ["true"],
  },
  JODOH: {
    type: "JODOH",
    stem: "Pasangkan.",
    points: 2,
    options: [
      { id: "s1", text: "Indonesia" },
      { id: "s2", text: "Jepang" },
    ],
    key: ["Jakarta", "Tokyo"],
  },
  Esai: {
    type: "Esai",
    stem: "Jelaskan jawaban Anda.",
    points: 5,
    options: [],
    key: [],
    rubric: "Ketepatan konsep dan alasan.",
    minChars: 20,
  },
};
