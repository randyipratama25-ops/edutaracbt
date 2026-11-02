import { z } from "zod";
import { roomInstant } from "../operations/rooms";
export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_EXPORT_LIMIT = 10000;
export const auditRowSchema = z.object({
  id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  actor: z.string().nullable(),
  action: z.string().min(1),
  target_type: z.string().min(1),
  target_id: z.string().nullable(),
});
export const auditListSchema = z
  .object({
    rows: z.array(auditRowSchema).max(AUDIT_PAGE_SIZE),
    total: z.number().int().nonnegative(),
  })
  .refine((d) => d.rows.length <= d.total, "Jumlah catatan tidak konsisten.")
  .refine(
    (d) => new Set(d.rows.map((r) => r.id)).size === d.rows.length,
    "Catatan audit berulang.",
  );
export type AuditRow = z.infer<typeof auditRowSchema>;
export type AuditFilters = { search: string; from: string; until: string };
export function auditQuery(filters: AuditFilters, page: number) {
  const from = filters.from ? roomInstant(filters.from) : undefined,
    until = filters.until ? roomInstant(filters.until) : undefined;
  if (from && until && from >= until)
    throw Error("Tanggal Dari harus sebelum tanggal Sebelum.");
  const q = new URLSearchParams({
    action: "audit",
    page: String(page),
    search: filters.search.trim(),
  });
  if (from) q.set("from", from);
  if (until) q.set("until", until);
  return "/api/system?" + q;
}
export function auditCSV(rows: AuditRow[]) {
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return (
      '"' +
      (/^[\s\u0000-\u001f]*[=+\-@]/.test(s) ? "'" : "") +
      s.replaceAll('"', '""') +
      '"'
    );
  };
  return (
    "\ufeff" +
    [
      ["Waktu (UTC)", "Aktor", "Aksi", "Objek", "ID"],
      ...rows.map((r) => [
        r.created_at,
        r.actor ?? "Otomasi",
        r.action,
        r.target_type,
        r.target_id,
      ]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}
/** Bound every request and reject a moving/incomplete dataset instead of downloading a partial CSV. */
export async function collectAudit(
  read: (page: number) => Promise<z.infer<typeof auditListSchema>>,
) {
  const rows: AuditRow[] = [],
    seen = new Set<string>();
  let expected: number | undefined;
  for (let page = 1; page <= AUDIT_EXPORT_LIMIT / AUDIT_PAGE_SIZE; page++) {
    const d = auditListSchema.parse(await read(page));
    if (d.total > AUDIT_EXPORT_LIMIT)
      throw Error(
        "Persempit tanggal/filter: maksimum 10.000 baris per ekspor.",
      );
    if (expected !== undefined && expected !== d.total)
      throw Error("Catatan berubah selama ekspor. Muat ulang dan coba lagi.");
    expected = d.total;
    for (const r of d.rows) {
      if (seen.has(r.id))
        throw Error(
          "Urutan catatan berubah. Muat ulang dan coba ekspor kembali.",
        );
      seen.add(r.id);
      rows.push(r);
    }
    if (rows.length === expected) return rows;
    if (
      !d.rows.length ||
      d.rows.length < AUDIT_PAGE_SIZE ||
      rows.length > expected
    )
      throw Error("Ekspor belum lengkap. Muat ulang dan coba lagi.");
  }
  throw Error("Batas ekspor tercapai. Persempit filter.");
}
