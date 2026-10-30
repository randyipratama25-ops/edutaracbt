import type { ResultDetail } from "../results/types";
export const exchangeHeaders = [
  "ID Peserta",
  "Nama peserta",
  "ID Ujian",
  "Ujian",
  "ID Attempt",
  "Kelas",
  "Revisi ledger",
  "Status attempt",
  "Status nilai",
  "Nilai final",
  "Kelulusan",
];
export function exchangeRow(d: ResultDetail): (string | number | null)[] {
  const a = d.attempt;
  const final =
    !!a.finalized_at &&
    a.pending === 0 &&
    a.status !== "disqualified" &&
    a.status !== "reset" &&
    a.score !== null;
  return [
    a.student_id,
    a.student,
    a.exam_id,
    a.title,
    a.id,
    a.class_name || a.class_ids.join(", "),
    a.revision,
    a.status,
    a.status === "disqualified"
      ? "Diskualifikasi"
      : final
        ? "Final"
        : "Menunggu",
    final ? a.score : null,
    final && a.passed !== null ? (a.passed ? "Lulus" : "Belum lulus") : "",
  ];
}
