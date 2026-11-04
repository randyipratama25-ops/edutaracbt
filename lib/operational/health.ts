import { z } from "zod";
import type { Snapshot } from "../acceptance/readiness";
export const drillSchema = z.object({
  action: z.literal("record"),
  request_id: z.uuid(),
  backup_id: z.uuid(),
  backup_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  completed_at: z.iso.datetime({ offset: true }),
  duration_seconds: z.number().int().min(1).max(86400),
  outcome: z.enum(["passed", "failed"]),
  evidence: z.string().trim().min(5).max(300),
  notes: z.string().trim().min(10).max(2000),
  confirmation: z.literal("KONFIRMASI"),
});
export type Health = Snapshot & {
  heartbeat_at: string | null;
  last_passed_drill_at: string | null;
  drills: {
    id: string;
    backup_id: string;
    completed_at: string;
    outcome: string;
    duration_seconds: number;
    evidence: string;
    notes: string;
  }[];
};
export function operationalChecks(
  s: Pick<
    Health,
    | "observed_at"
    | "heartbeat_at"
    | "last_passed_drill_at"
    | "automation_enabled"
    | "worker_approved"
    | "job_issues"
    | "stalled_jobs"
    | "backup"
    | "drills"
  >,
  now = Date.now(),
) {
  const fresh = (date: string | null, max: number) => {
    const age = now - Date.parse(date || "");
    return age >= 0 && age <= max;
  };
  const backup = s.backup;
  return [
    {
      title: "Pemantauan terbaru",
      passed: fresh(s.observed_at, 120000),
      detail: "Muat ulang bila pemeriksaan lebih dari 2 menit.",
    },
    {
      title: "Penjadwal otomatis",
      passed: fresh(s.heartbeat_at, 300000),
      detail:
        "Status penjadwal diharapkan diperbarui dalam 5 menit. Buka pemeriksaan penerimaan jika terlambat.",
      href: "/dashboard/acceptance",
    },
    {
      title: "Backup mingguan",
      passed:
        !!backup &&
        fresh(backup.completed_at, 8 * 86400000) &&
        /^[a-f0-9]{64}$/.test(backup.checksum || "") &&
        backup.parts > 0 &&
        backup.captured_after_coverage_fix,
      detail:
        "Backup selesai maksimal 8 hari lalu, dengan manifest dan bagian tersedia. Periksa unduhan/checksum sebelum digunakan.",
      href: "/dashboard/jobs",
    },
    {
      title: "Antrean pekerjaan",
      passed: s.job_issues === 0 && s.stalled_jobs === 0,
      detail: `${s.job_issues} bermasalah; ${s.stalled_jobs} terlambat. Periksa alasan dan coba ulang pekerjaan yang sesuai.`,
      href: "/dashboard/jobs",
    },
    {
      title: "Otomasi aktif",
      passed: s.automation_enabled && s.worker_approved,
      detail: "Periksa pengaturan otomasi dan kesiapan layanan pemrosesan.",
      href: "/dashboard/settings",
    },
    {
      title: "Latihan pemulihan 30 hari",
      passed:
        fresh(s.last_passed_drill_at, 30 * 86400000) &&
        s.drills[0]?.outcome !== "failed",
      detail:
        "Memerlukan catatan Admin dari backup asli pada lingkungan terisolasi. Hasil simulasi CI dicatat terpisah.",
    },
  ];
}

/** Validate the fields used by the operational view; preserve the existing snapshot contract. */
export const healthSchema = z
  .object({
    observed_at: z.iso.datetime({ offset: true }),
    heartbeat_at: z.iso.datetime({ offset: true }).nullable(),
    last_passed_drill_at: z.iso.datetime({ offset: true }).nullable(),
    automation_enabled: z.boolean(),
    worker_approved: z.boolean(),
    job_issues: z.number().int().nonnegative(),
    stalled_jobs: z.number().int().nonnegative(),
    backup: z
      .object({
        id: z.uuid(),
        completed_at: z.iso.datetime({ offset: true }),
        checksum: z.string().nullable(),
        parts: z.number().int().nonnegative(),
        captured_after_coverage_fix: z.boolean(),
      })
      .nullable(),
    drills: z
      .array(
        z.object({
          id: z.uuid(),
          backup_id: z.uuid(),
          completed_at: z.iso.datetime({ offset: true }),
          outcome: z.enum(["passed", "failed"]),
          duration_seconds: z.number().int().positive(),
          evidence: z.string(),
          notes: z.string(),
        }),
      )
      .max(10),
  })
  .passthrough();
export type HealthView = z.infer<typeof healthSchema>;
