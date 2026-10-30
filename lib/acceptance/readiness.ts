export type Snapshot = {
  observed_at: string;
  operational_accepted: false;
  active_attempts: number;
  automation_enabled: boolean;
  reminders_enabled: boolean;
  retention_days: number;
  smtp_configured: boolean;
  worker_approved: boolean;
  schedulers: { name: string; active: boolean; schedule: string }[];
  job_issues: number;
  stalled_jobs: number;
  pending_moderations: number;
  blocked_publications: number;
  backup: {
    id: string;
    completed_at: string;
    checksum: string | null;
    parts: number;
    captured_after_coverage_fix: boolean;
  } | null;
};
export const humanChecks = [
  {
    id: "uat",
    title: "UAT semua peran dan perangkat fisik",
    detail:
      "Admin, Guru, Pengawas dan Siswa; desktop, tablet, ponsel; jaringan putus, retry, ambil alih sesi dan submit.",
  },
  {
    id: "load",
    title: "Beban dan SLO 150 siswa",
    detail:
      "p95 login/submit ≤3 detik, autosave ≤1,5 detik, error ≤1%, selisih jawaban 0. Burst login dan sesi terautentikasi dilaporkan terpisah.",
  },
  {
    id: "legacy",
    title: "Rekonsiliasi legacy",
    detail:
      "Sumber, freeze, pemetaan dan delta parity. Dataset belum tersedia bukan keputusan mulai tanpa data lama.",
  },
  {
    id: "recovery",
    title: "Email dan pemulihan akun",
    detail:
      "Periksa inbox, tautan undangan/reset, login ulang dan akses tiap peran. SMTP Auth berbeda dari reminder aplikasi.",
  },
  {
    id: "restore",
    title: "Backup dan rollback cloud",
    detail:
      "Verifikasi unduhan, checksum, restore terisolasi, media, reaktivasi Auth/Vault dan kelestarian jawaban terbaru.",
  },
  {
    id: "owner",
    title: "Serah-terima dan pengamatan",
    detail:
      "Penanggung jawab, kandidat SHA, durasi pengamatan, prosedur insiden dan persetujuan pemilik dicatat dengan bukti asli.",
  },
];
const expected = {
  "edutara-operations": "* * * * *",
  "edutara-recovery-retention": "*/15 * * * *",
  "edutara-results-publication": "* * * * *",
};
export function technicalChecks(s: Snapshot, now = Date.now()) {
  const age = now - Date.parse(s.observed_at);
  const backupAge = s.backup
    ? now - Date.parse(s.backup.completed_at)
    : Infinity;
  return [
    {
      title: "Snapshot terkini",
      passed: Number.isFinite(age) && age >= -5000 && age <= 300000,
      detail: "Muat ulang maksimal lima menit sebelum keputusan.",
      href: "",
    },
    {
      title: "Tidak ada sesi belum final",
      passed: s.active_attempts === 0,
      detail: `${s.active_attempts} sesi belum final. Jangan reset peserta untuk meluluskan pemeriksaan.`,
      href: "/dashboard/monitor",
    },
    {
      title: "Scheduler sesuai fungsi",
      passed: Object.entries(expected).every(
        ([name, schedule]) =>
          s.schedulers.filter(
            (j) => j.name === name && j.active && j.schedule === schedule,
          ).length === 1,
      ),
      detail:
        "Satu job untuk operasi, satu retensi draf dan satu publikasi hasil; ketiganya memiliki tujuan berbeda.",
      href: "/dashboard/jobs",
    },
    {
      title: "Otomasi dan worker",
      passed: s.automation_enabled && s.worker_approved,
      detail:
        "Konfigurasi aktif belum membuktikan keberhasilan setiap pengiriman atau job.",
      href: "/dashboard/settings",
    },
    {
      title: "Antrean pekerjaan",
      passed: s.job_issues === 0 && s.stalled_jobs === 0,
      detail: `${s.job_issues} gagal/terblokir/tidak pasti; ${s.stalled_jobs} antrean atau lease terlambat.`,
      href: "/dashboard/jobs",
    },
    {
      title: "Kesiapan publikasi nilai",
      passed: s.pending_moderations === 0 && s.blocked_publications === 0,
      detail: `${s.pending_moderations} moderasi menunggu; ${s.blocked_publications} publikasi terblokir.`,
      href: "/dashboard/grading",
    },
    {
      title: "Backup terbaru dengan cakupan bank",
      passed:
        !!s.backup &&
        s.backup.captured_after_coverage_fix &&
        /^[a-f0-9]{64}$/.test(s.backup.checksum || "") &&
        s.backup.parts > 0 &&
        backupAge >= 0 &&
        backupAge <= 3600000,
      detail:
        "Memerlukan backup baru setelah perbaikan cakupan, selesai ≤1 jam. Tetap perlu pemeriksaan bytes dan latihan restore terpisah.",
      href: "/dashboard/jobs",
    },
    {
      title: "Konfigurasi SMTP aplikasi",
      passed: s.smtp_configured,
      detail: `Reminder ${s.reminders_enabled ? "aktif" : "nonaktif"}; retensi backup ${s.retention_days} hari. Konfigurasi bukan bukti email masuk inbox.`,
      href: "/dashboard/settings",
    },
  ];
}
