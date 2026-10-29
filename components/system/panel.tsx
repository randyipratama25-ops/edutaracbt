"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { api } from "../operations/shared";
import type { AppSettings } from "../../lib/system/validation";
type Job = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  attempts: number;
  error: string | null;
  created_at: string;
  outcome: string | null;
};
type Audit = {
  id: string;
  created_at: string;
  actor: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
};
type Part = {
  number: number;
  kind: string;
  bytes: number;
  sha256: string;
  path: string;
};
export function SystemPanel({ mode }: { mode: "settings" | "audit" | "jobs" }) {
  const [settings, setSettings] = useState<AppSettings | null>(null),
    [jobs, setJobs] = useState<Job[]>([]),
    [audit, setAudit] = useState<Audit[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [secret, setSecret] = useState(""),
    [key, setKey] = useState("smtp_password"),
    [parts, setParts] = useState<Part[]>([]),
    [backupId, setBackupId] = useState(""),
    [decision, setDecision] = useState<{
      action: string;
      id: string;
      resolution?: string;
    } | null>(null),
    [decisionReason, setDecisionReason] = useState(""),
    [decisionConfirm, setDecisionConfirm] = useState("");
  const sequence = useRef(0),
    retry = useRef<{ key: string; id: string } | null>(null);
  const auditURL = useCallback(
    (p: number) => {
      const q = new URLSearchParams({
        action: "audit",
        page: String(p),
        search,
      });
      if (from) q.set("from", new Date(from).toISOString());
      if (until) q.set("until", new Date(until).toISOString());
      return "/api/system?" + q;
    },
    [search, from, until],
  );
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    try {
      if (mode === "settings") {
        const s = await api<AppSettings>("/api/system");
        if (seq === sequence.current) setSettings(s);
      } else if (mode === "jobs") {
        const j = await api<Job[]>("/api/system?action=jobs");
        if (seq === sequence.current) setJobs(j);
      } else {
        const a = await api<{ rows: Audit[]; total: number }>(auditURL(page));
        if (seq === sequence.current) {
          setAudit(a.rows);
          setTotal(a.total);
        }
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Data belum dapat dimuat.");
    }
  }, [mode, page, auditURL]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (mode !== "jobs") return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [mode, load]);
  async function save(input: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      let data = input;
      if (input.action === "backup" || input.action === "smtp_probe") {
        const k = JSON.stringify(input);
        if (retry.current?.key !== k)
          retry.current = { key: k, id: crypto.randomUUID() };
        data = { ...input, request_id: retry.current.id };
      }
      await api("/api/system", data);
      retry.current = null;
      setSecret("");
      setDecision(null);
      setMessage(
        input.action === "secret"
          ? "Secret tersimpan; nilainya tidak ditampilkan kembali."
          : "Permintaan tersimpan.",
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function exportAudit() {
    setBusy(true);
    try {
      const rows: Audit[] = [];
      let p = 1;
      for (;;) {
        const d = await api<{ rows: Audit[]; total: number }>(auditURL(p));
        if (d.total > 10000)
          throw Error(
            "Persempit tanggal/filter: maksimum 10.000 baris per ekspor.",
          );
        rows.push(...d.rows);
        if (rows.length >= d.total) break;
        p++;
      }
      const cell = (v: unknown) => {
        const s = String(v ?? "");
        return (
          '"' + (/^[=+\-@]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
        );
      };
      const csv =
        "\ufeff" +
        [
          ["Waktu", "Aktor", "Aksi", "Objek", "ID"],
          ...rows.map((r) => [
            r.created_at,
            r.actor,
            r.action,
            r.target_type,
            r.target_id,
          ]),
        ]
          .map((r) => r.map(cell).join(","))
          .join("\r\n");
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit-edutara.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ekspor gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack">
      <p role="status">{message}</p>
      {mode === "settings" && settings && (
        <>
          <form
            className="stack"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void save({
                action: "save",
                version: settings.version,
                settings,
              });
            }}
          >
            <div className="toolbar">
              {(
                [
                  "name",
                  "subtitle",
                  "timezone",
                  "login_logo_id",
                  "login_background_id",
                  "smtp_sender",
                ] as const
              ).map((k) => (
                <label key={k}>
                  {
                    {
                      name: "Nama aplikasi",
                      subtitle: "Subjudul",
                      timezone: "Zona waktu sekolah",
                      login_logo_id: "ID logo login (publik)",
                      login_background_id: "ID gambar login (publik)",
                      smtp_sender: "Email pengirim Gmail / Google Workspace",
                    }[k]
                  }
                  <input
                    value={settings[k] || ""}
                    maxLength={k === "subtitle" ? 200 : 100}
                    onChange={(e) =>
                      setSettings({ ...settings, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                Batas insiden untuk tinjauan
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={settings.violation_limit}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      violation_limit: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Retensi backup (hari)
                <input
                  type="number"
                  min={7}
                  max={730}
                  value={settings.retention_days}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retention_days: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <fieldset>
              <legend>Kebijakan</legend>
              {(
                [
                  "canvas_enabled",
                  "results_enabled",
                  "automation_enabled",
                  "reminders_enabled",
                ] as const
              ).map((k) => (
                <label key={k} className="actions">
                  <input
                    type="checkbox"
                    checked={settings[k]} disabled={k==='reminders_enabled'&&!settings.worker_capabilities?.smtp}
                    onChange={(e) =>
                      setSettings({ ...settings, [k]: e.target.checked })
                    }
                  />
                  {
                    {
                      canvas_enabled: "Aktifkan canvas untuk attempt baru",
                      results_enabled:
                        "Izinkan hasil yang sudah diterbitkan Admin terlihat siswa",
                      automation_enabled:
                        "Aktifkan otomasi jadwal, timeout, backup semester dan retensi",
                      reminders_enabled:
                        "Aktifkan email pengingat kepada Guru terverifikasi",
                    }[k]
                  }
                </label>
              ))}
            </fieldset>
            <label>
              Template pengingat
              <textarea
                rows={5}
                minLength={20}
                maxLength={5000}
                value={settings.reminder_template}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    reminder_template: e.target.value,
                  })
                }
              />
            </label>
            <small>
              Variabel: {"{{nama}}, {{periode}}, {{kekurangan}}, {{tautan}}"}.
              Pengingat saat periode tersisa ≤24 jam pada pukul 11, 13, 15, 17,
              19, 21, 23 waktu sekolah.
            </small>
            <p>
              Backup semester: 30 Juni dan 31 Desember pukul 23.30. Dua backup
              terakhir tetap dipertahankan.
            </p>
            <Button disabled={busy}>Simpan pengaturan</Button>
          </form>
          <hr />
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ action: "secret", key, value: secret });
            }}
          >
            <h2>Kredensial rahasia</h2>{!settings.worker_capabilities?.smtp&&<p>Email dan retensi otomatis belum diaktifkan. Backup tetap tersedia.</p>}
            <label>
              Jenis
              <select
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setSecret("");
                }}
              >
                <option value="smtp_password">App password Gmail</option>
                <option value="ai_api_key">
                  Kunci AI — adaptor tetap nonaktif
                </option>
                <option value="drive_access_token">
                  Token Drive — adaptor server perlu konfigurasi
                </option>
              </select>
            </label>
            <p>{settings.secrets[key] ? "Tersimpan" : "Belum tersimpan"}</p>
            <label>
              Nilai baru
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={10000}
                required
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </label>
            <Button disabled={busy || secret.length < 8}>
              Simpan secret baru
            </Button>
            <small>
              Nilai tidak dapat dibaca kembali. Menyimpan kunci AI/Drive tidak
              mengaktifkan integrasinya.
            </small>
          </form>
          <Button
            variant="outline"
            disabled={busy||!settings.worker_capabilities?.smtp}
            onClick={() => void save({ action: "smtp_probe" })}
          >
            Uji koneksi SMTP tanpa mengirim pesan
          </Button>
          <p>
            <a href="/dashboard/exams">Atur periode input dan target soal</a> ·{" "}
            <a href="/dashboard/results">Atur kop/template laporan</a>
          </p>
        </>
      )}
      {mode === "audit" && (
        <>
          <div className="toolbar">
            <label>
              Aktor/aksi/objek
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Dari
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Sebelum
              <input
                type="datetime-local"
                value={until}
                onChange={(e) => {
                  setUntil(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void exportAudit()}
            >
              Ekspor CSV
            </Button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Aktor</th>
                  <th>Aksi</th>
                  <th>Objek</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString("id-ID")}</td>
                    <td>{r.actor || "Otomasi"}</td>
                    <td>{r.action}</td>
                    <td>{r.target_type}</td>
                    <td>{r.target_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </Button>
            <span>
              {total} catatan · halaman {page}
            </span>
            <Button
              variant="outline"
              disabled={page * 50 >= total}
              onClick={() => setPage(page + 1)}
            >
              Berikutnya
            </Button>
          </div>
        </>
      )}
      {mode === "jobs" && (
        <>
          <div className="actions">
            <Button
              disabled={busy}
              onClick={() => void save({ action: "backup" })}
            >
              Buat backup manual
            </Button>
            <Button variant="outline" onClick={() => void load()}>
              Muat ulang
            </Button>
          </div>
          <p>
            Backup mencakup data aplikasi, konfigurasi/template dan bytes media.
            Kredensial Auth, sesi dan nilai secret tidak diekspor; pemulihan
            akun memerlukan aktivasi ulang. Dump PostgreSQL/PITR dan escrow
            secret tetap dikelola terpisah.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu / jenis</th>
                  <th>Status</th>
                  <th>Progres</th>
                  <th>Hasil / tindakan</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      {new Date(j.created_at).toLocaleString("id-ID")}
                      <br />
                      {j.kind}
                    </td>
                    <td>
                      {j.status} {j.outcome && <small>{j.outcome}</small>}
                    </td>
                    <td>
                      <progress
                        max={100}
                        value={j.progress}
                        aria-label="Progres job"
                      />{" "}
                      {j.progress}%
                    </td>
                    <td>
                      {j.error && <p>{j.error}</p>}
                      {j.kind === "backup" && j.status === "succeeded" && (
                        <div className="actions">
                          <a href={"/api/backups/download?id=" + j.id}>
                            Manifest
                          </a>
                          <a href={"/api/backups/export?id=" + j.id}>
                            ZIP (hingga 50 MiB)
                          </a>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setBackupId(j.id);
                              void api<Part[]>(
                                "/api/system?action=parts&id=" + j.id,
                              )
                                .then(setParts)
                                .catch((e) => setMessage(e.message));
                            }}
                          >
                            Lihat bagian
                          </Button>
                        </div>
                      )}
                      {["failed", "blocked"].includes(j.status) &&
                        j.outcome !== "cancelled" && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void save({ action: "retry", id: j.id })
                            }
                          >
                            Coba ulang
                          </Button>
                        )}
                      {j.kind === "backup" &&
                        j.status !== "succeeded" &&
                        j.outcome !== "cancelled" && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setDecision({
                                action: "cancel_backup",
                                id: j.id,
                              });
                              setDecisionReason("");
                              setDecisionConfirm("");
                            }}
                          >
                            Batalkan backup
                          </Button>
                        )}
                      {j.status === "uncertain" && (
                        <>
                          <p>Periksa mailbox/provider sebelum rekonsiliasi.</p>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setDecision({
                                action: "resolve_email",
                                id: j.id,
                                resolution: "sent",
                              });
                              setDecisionReason("");
                              setDecisionConfirm("");
                            }}
                          >
                            Konfirmasi sudah terkirim
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setDecision({
                                action: "resolve_email",
                                id: j.id,
                                resolution: "not_sent",
                              });
                              setDecisionReason("");
                              setDecisionConfirm("");
                            }}
                          >
                            Konfirmasi belum terkirim
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>100 job terbaru. Scheduler tunggal: Supabase Cron.</p>
          {parts.length > 0 && (
            <details open>
              <summary>Bagian backup {backupId}</summary>
              <ul>
                {parts.map((p) => (
                  <li key={p.number}>
                    <a
                      href={
                        "/api/backups/download?id=" +
                        backupId +
                        "&part=" +
                        p.number
                      }
                    >
                      {p.kind} · {(p.bytes / 1024).toFixed(1)} KiB
                    </a>{" "}
                    · SHA-256 <code>{p.sha256}</code>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <Dialog
        open={!!decision}
        onOpenChange={(v) => {
          if (!v && !busy) setDecision(null);
        }}
        title={
          decision?.action === "cancel_backup"
            ? "Batalkan backup"
            : "Rekonsiliasi pengiriman"
        }
        description="Tindakan Admin dicatat. Rekonsiliasi belum terkirim akan menjadwalkan ulang email jika penerima masih eligible."
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (decision)
              void save({
                ...decision,
                reason: decisionReason,
                confirmation: decisionConfirm,
              });
          }}
        >
          <label>
            Alasan pemeriksaan
            <textarea
              required
              minLength={5}
              maxLength={1000}
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
            />
          </label>
          <label>
            Ketik KONFIRMASI
            <input
              required
              pattern="KONFIRMASI"
              value={decisionConfirm}
              onChange={(e) => setDecisionConfirm(e.target.value)}
            />
          </label>
          <p role="status">{message}</p>
          <Button disabled={busy}>Konfirmasi tindakan</Button>
        </form>
      </Dialog>
    </section>
  );
}
