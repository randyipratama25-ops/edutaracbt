import { z } from "zod";
export const jobKinds = {
  backup: "Backup",
  reminder: "Pengingat email",
  smtp_probe: "Uji koneksi SMTP",
  retention: "Pembersihan terjadwal",
} as const;
export const jobStatuses = {
  queued: "Menunggu",
  running: "Diproses",
  succeeded: "Selesai",
  failed: "Gagal",
  blocked: "Terblokir",
  uncertain: "Perlu pemeriksaan",
} as const;
export const jobSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["backup", "reminder", "smtp_probe", "retention"]),
    status: z.enum([
      "queued",
      "running",
      "succeeded",
      "failed",
      "blocked",
      "uncertain",
    ]),
    progress: z.number().int().min(0).max(100),
    attempts: z.number().int().nonnegative(),
    error: z.string().nullable(),
    created_at: z.iso.datetime({ offset: true }),
    outcome: z.string().nullable(),
  })
  .passthrough();
export const jobsSchema = z
  .array(jobSchema)
  .max(100)
  .refine(
    (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
    "ID pekerjaan berulang.",
  );
export const partsSchema = z
  .array(
    z
      .object({
        number: z.number().int().nonnegative(),
        kind: z.string().min(1),
        bytes: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .passthrough(),
  )
  .refine(
    (rows) => new Set(rows.map((r) => r.number)).size === rows.length,
    "Nomor bagian berulang.",
  );
export type Job = z.infer<typeof jobSchema>;
export type BackupPart = z.infer<typeof partsSchema>[number];
const terminalOutcomes = ["cancelled", "retention_pending", "retired"];
export function jobActions(job: Job) {
  const protectedOutcome =
    !!job.outcome && terminalOutcomes.includes(job.outcome);
  return {
    download:
      job.kind === "backup" && job.status === "succeeded" && !protectedOutcome,
    retry: ["failed", "blocked"].includes(job.status) && !protectedOutcome,
    cancel:
      job.kind === "backup" && job.status !== "succeeded" && !protectedOutcome,
    reconcile: job.kind === "reminder" && job.status === "uncertain",
  };
}
export function jobOutcome(value: string | null) {
  const labels: Record<string, string> = {
    cancelled: "Dibatalkan",
    retention_pending: "Sedang dibersihkan",
    retired: "Berkas telah dibersihkan",
    completed: "Selesai",
    reconciled_sent: "Dikonfirmasi terkirim",
    reconciled_not_sent: "Dijadwalkan ulang",
    sent: "Terkirim",
    skipped: "Dilewati",
  };
  return value ? labels[value] || value : "";
}
export function jobDate(value: string) {
  return (
    new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) +
    " WIB"
  );
}
