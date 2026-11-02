"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { z } from "zod";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import { settingsSchema, systemMutation } from "../../lib/system/validation";
import {
  appSettingsSchema,
  settingsReceipt,
  settingsValues,
  validTimezone,
  secretKeys,
  type SettingsResponse,
} from "../../lib/system/contracts";
type Values = z.infer<typeof settingsSchema>;
const policyLabels = {
  canvas_enabled: "Area gambar untuk pengerjaan baru",
  results_enabled: "Hasil yang diterbitkan dapat dilihat siswa",
  automation_enabled: "Otomasi jadwal, timeout, backup dan retensi",
  reminders_enabled: "Email pengingat kepada Guru terverifikasi",
} as const;
const secretLabels = {
  smtp_password: "App password Gmail",
  ai_api_key: "Kunci AI lama",
  drive_access_token: "Token Drive",
};
export function SettingsPanel() {
  const [server, setServer] = useState<SettingsResponse | null>(null),
    [draft, setDraft] = useState<Values | null>(null),
    [loading, setLoading] = useState(true),
    [readError, setReadError] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [confirmReload, setConfirmReload] = useState(false),
    [secret, setSecret] = useState(""),
    [secretKey, setSecretKey] =
      useState<(typeof secretKeys)[number]>("smtp_password"),
    [probeId, setProbeId] = useState("");
  const mounted = useRef(false),
    lock = useRef(false),
    sequence = useRef(0),
    read = useRef<AbortController | null>(null),
    write = useRef<AbortController | null>(null),
    probeRetry = useRef<{signature:string;id:string} | null>(null);
  const dirty =
    !!draft &&
    !!server &&
    JSON.stringify(draft) !== JSON.stringify(settingsValues(server));
  const invalidate = useCallback(() => {
    sequence.current++;
    read.current?.abort();
    read.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidate();
      write.current?.abort();
    };
  }, [invalidate]);
  const load = useCallback(async () => {
    if (!mounted.current) return false;
    invalidate();
    const generation = sequence.current,
      c = new AbortController();
    read.current = c;
    setLoading(true);
    setReadError("");
    try {
      const data = await clientRequest(
        "/api/system",
        undefined,
        appSettingsSchema,
        c,
      );
      if (!mounted.current || generation !== sequence.current) return false;
      setServer(data);
      setDraft(settingsValues(data));
      setUncertain(false);
      return true;
    } catch (e) {
      if (mounted.current && generation === sequence.current)
        setReadError(
          e instanceof Error ? e.message : "Pengaturan gagal dimuat.",
        );
      return false;
    } finally {
      if (mounted.current && generation === sequence.current) {
        setLoading(false);
        read.current = null;
      }
    }
  }, [invalidate]);
  useEffect(() => {
    void load();
  }, [load]);
  function reload() {
    if (lock.current || loading) return;
    if (dirty || secret) {
      setConfirmReload(true);
      return;
    }
    setMessage("");
    setError("");
    void load();
  }
  async function mutate(action: "save" | "secret" | "smtp_probe") {
    if (lock.current || loading || uncertain || !server || !draft) return;
    let input: z.infer<typeof systemMutation>;
    try {
      if (action === "save") {
        if (!validTimezone(draft.timezone))
          throw Error("Zona waktu tidak dikenali. Contoh: Asia/Jakarta.");
        if (
          draft.reminders_enabled &&
          (!server.worker_capabilities?.smtp ||
            !server.secrets.smtp_password ||
            !draft.smtp_sender)
        )
          throw Error(
            "Pengingat memerlukan layanan email aktif serta email pengirim dan App password tersimpan. Nonaktifkan pengingat bila layanan belum siap.",
          );
        input = systemMutation.parse({
          action,
          version: server.version,
          settings: draft,
        });
      } else if (action === "secret")
        input = systemMutation.parse({ action, key: secretKey, value: secret });
      else {
        if (
          !server.worker_capabilities?.smtp ||
          !server.secrets.smtp_password ||
          !server.smtp_sender
        )
          throw Error(
            "Simpan email pengirim dan App password sebelum menguji SMTP.",
          );
        if (draft.smtp_sender !== server.smtp_sender)
          throw Error("Simpan perubahan email pengirim sebelum menguji SMTP.");
        const signature=JSON.stringify({version:server.version,sender:server.smtp_sender});
        if(probeRetry.current?.signature!==signature)probeRetry.current={signature,id:crypto.randomUUID()};
        input = { action, request_id: probeRetry.current.id };
      }
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? "Periksa nama, email, ID media, angka dan template sesuai batas isian."
          : e instanceof Error
            ? e.message
            : "Periksa isian.",
      );
      return;
    }
    if(action==='secret')probeRetry.current=null;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    invalidate();
    const c = new AbortController();
    write.current = c;
    try {
      const receipt = await clientRequest(
        "/api/system",
        input,
        settingsReceipt(action),
        c,
        { mutation: true },
      );
      if (!mounted.current) return;
      if (action === "save") {
        const refreshed = await load();
        if (!mounted.current) return;
        if (refreshed)
          setMessage(
            "Pengaturan tersimpan. Branding dan kebijakan mengikuti konfigurasi terbaru.",
          );
        else {
          setUncertain(true);
          setError(
            "Pengaturan tersimpan, tetapi status terbaru belum dapat dimuat. Muat ulang sebelum menyimpan kembali.",
          );
        }
      } else if (action === "secret") {
        setSecret("");
        setServer((prev) =>
          prev
            ? {
                ...prev,
                secrets: {
                  ...prev.secrets,
                  [input.action === "secret" ? input.key : secretKey]: true,
                },
              }
            : prev,
        );
        setMessage(
          "Kredensial tersimpan. Nilainya tidak ditampilkan kembali. Draf pengaturan umum tetap dipertahankan.",
        );
      } else {
        probeRetry.current = null;
        const result = z.object({ id: z.uuid() }).parse(receipt);
        setProbeId(result.id);
        setMessage(
          "Permintaan uji SMTP dijadwalkan. Hasil koneksi tersedia di halaman Pekerjaan; belum berarti koneksi berhasil.",
        );
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "Permintaan gagal.");
        if (
          e instanceof ClientRequestError &&
          (e.uncertain || e.status === 409)
        ) {
          setUncertain(true);
          if (action === "secret") setSecret("");
        }
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const smtpReady =
    !!server?.worker_capabilities?.smtp &&
    !!server?.secrets.smtp_password &&
    !!server?.smtp_sender;
  function submit(e: FormEvent) {
    e.preventDefault();
    void mutate("save");
  }
  return (
    <section
      className="panel stack settings-page"
      aria-label="Pengaturan aplikasi"
      aria-busy={busy || loading}
    >
      <div className="actions settings-heading">
        <div>
          <h2>Konfigurasi madrasah</h2>
          <p className="muted">Identitas aplikasi, kebijakan dan layanan.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || loading}
          onClick={reload}
        >
          Muat ulang status
        </Button>
      </div>
      {loading && <p role="status">Memuat pengaturan…</p>}
      {readError && (
        <div role="alert">
          <p>{readError}</p>
          <Button
            type="button"
            variant="outline"
            disabled={busy || loading}
            onClick={reload}
          >
            Coba muat pengaturan
          </Button>
        </div>
      )}
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {uncertain && (
        <div className="settings-notice" role="alert">
          <p>
            Hasil perlu diperiksa. Muat ulang status sebelum mengirim perubahan
            lagi. Untuk uji SMTP, periksa pekerjaan yang sudah terjadwal;
            hindari membuat permintaan baru sebelum hasil diperiksa.
          </p>
          <a href="/dashboard/jobs">Periksa pekerjaan sistem</a>
        </div>
      )}
      {server && draft && (
        <>
          <div className="settings-summary" aria-label="Status konfigurasi">
            <span>
              Versi <strong>{server.version}</strong>
            </span>
            <span>
              {dirty
                ? "Ada perubahan belum disimpan"
                : "Pengaturan sesuai status tersimpan"}
            </span>
            <span>
              SMTP{" "}
              {server.worker_capabilities?.smtp ? "tersedia" : "belum tersedia"}
            </span>
            <span>
              Retensi otomatis{" "}
              {server.worker_capabilities?.retention
                ? "tersedia"
                : "belum tersedia"}
            </span>
          </div>
          <fieldset
            className="settings-controls stack"
            disabled={busy || loading || uncertain || !!readError}
          >
            <form className="stack" onSubmit={submit}>
              <fieldset className="settings-section stack">
                <legend>Identitas dan branding</legend>
                <div className="settings-grid">
                  <label>
                    Nama aplikasi
                    <input
                      required
                      maxLength={100}
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev ? { ...prev, name: e.target.value } : prev,
                        )
                      }
                    />
                  </label>
                  <label>
                    Subjudul
                    <input
                      maxLength={200}
                      value={draft.subtitle}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev ? { ...prev, subtitle: e.target.value } : prev,
                        )
                      }
                    />
                  </label>
                  <label>
                    Zona waktu sekolah
                    <input
                      required
                      maxLength={80}
                      list="settings-timezones"
                      value={draft.timezone}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev ? { ...prev, timezone: e.target.value } : prev,
                        )
                      }
                    />
                    <datalist id="settings-timezones">
                      {[
                        "Asia/Jakarta",
                        "Asia/Makassar",
                        "Asia/Jayapura",
                        "UTC",
                      ].map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    ID logo login (publik)
                    <input
                      maxLength={36}
                      value={draft.login_logo_id || ""}
                      placeholder="Kosongkan untuk logo bawaan"
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? { ...prev, login_logo_id: e.target.value }
                            : prev,
                        )
                      }
                    />
                  </label>
                  <label>
                    ID gambar login (publik)
                    <input
                      maxLength={36}
                      value={draft.login_background_id || ""}
                      placeholder="Kosongkan untuk latar bawaan"
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? { ...prev, login_background_id: e.target.value }
                            : prev,
                        )
                      }
                    />
                  </label>
                </div>
                <p className="muted">
                  Gunakan ID gambar dari{" "}
                  <a href="/dashboard/media">Media soal</a>. Logo dan latar
                  login dapat diakses publik. Perubahan terlihat saat halaman
                  login dimuat ulang.
                </p>
              </fieldset>
              <fieldset className="settings-section stack">
                <legend>Kebijakan ujian dan otomasi</legend>
                <div className="settings-grid">
                  <label>
                    Batas insiden untuk tinjauan
                    <input
                      required
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={
                        Number.isNaN(draft.violation_limit)
                          ? ""
                          : draft.violation_limit
                      }
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                violation_limit:
                                  e.target.value === ""
                                    ? NaN
                                    : Number(e.target.value),
                              }
                            : prev,
                        )
                      }
                    />
                  </label>
                  <label>
                    Retensi backup (hari)
                    <input
                      required
                      type="number"
                      min={7}
                      max={730}
                      step={1}
                      value={
                        Number.isNaN(draft.retention_days)
                          ? ""
                          : draft.retention_days
                      }
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                retention_days:
                                  e.target.value === ""
                                    ? NaN
                                    : Number(e.target.value),
                              }
                            : prev,
                        )
                      }
                    />
                  </label>
                </div>
                <div className="settings-policies">
                  {(
                    Object.keys(policyLabels) as (keyof typeof policyLabels)[]
                  ).map((k) => (
                    <label key={k}>
                      <input
                        type="checkbox"
                        checked={draft[k]}
                        disabled={
                          k === "reminders_enabled" &&
                          !server.worker_capabilities?.smtp &&
                          !draft.reminders_enabled
                        }
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setDraft((prev) =>
                            prev ? { ...prev, [k]: checked } : prev,
                          );
                        }}
                      />
                      <span>{policyLabels[k]}</span>
                    </label>
                  ))}
                </div>
                <p className="muted">
                  Area gambar berlaku untuk pengerjaan baru. Hasil tetap memerlukan
                  publikasi Admin. Backup mingguan/semester serta retensi
                  mengikuti otomasi; dua backup terakhir tetap dipertahankan.
                </p>
              </fieldset>
              <fieldset className="settings-section stack">
                <legend>Email pengingat</legend>
                <label>
                  Email pengirim Gmail / Google Workspace
                  <input
                    type="email"
                    maxLength={254}
                    value={draft.smtp_sender}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev ? { ...prev, smtp_sender: e.target.value } : prev,
                      )
                    }
                  />
                </label>
                <label>
                  Template pengingat
                  <textarea
                    required
                    rows={5}
                    minLength={20}
                    maxLength={5000}
                    value={draft.reminder_template}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev
                          ? { ...prev, reminder_template: e.target.value }
                          : prev,
                      )
                    }
                  />
                </label>
                <details>
                  <summary>Variabel template dan jadwal</summary>
                  <p>{"{{nama}}, {{periode}}, {{kekurangan}}, {{tautan}}"}</p>
                  <p>
                    Pengingat saat periode tersisa ≤24 jam pada pukul 11, 13,
                    15, 17, 19, 21, 23 waktu sekolah. Backup semester: 30 Juni
                    dan 31 Desember pukul 23.30.
                  </p>
                </details>
              </fieldset>
              <div className="actions">
                <Button disabled={!dirty}>
                  {busy ? "Menyimpan…" : "Simpan pengaturan"}
                </Button>
                <span className="muted">
                  {dirty ? "Perubahan belum disimpan." : "Tidak ada perubahan."}
                </span>
              </div>
            </form>
            <form
              className="settings-section stack"
              onSubmit={(e) => {
                e.preventDefault();
                void mutate("secret");
              }}
              aria-label="Kredensial rahasia"
            >
              <h2>Kredensial rahasia</h2>
              <p>
                Hanya status penyimpanan yang dapat dibaca. Mengganti kredensial
                tidak menyimpan draf pengaturan umum.
              </p>
              <label>
                Jenis kredensial
                <select
                  value={secretKey}
                  onChange={(e) => {
                    setSecretKey(e.target.value as (typeof secretKeys)[number]);
                    setSecret("");
                  }}
                >
                  {secretKeys.map((k) => (
                    <option key={k} value={k}>
                      {secretLabels[k]}
                    </option>
                  ))}
                </select>
              </label>
              <p role="status">
                {server.secrets[secretKey] ? "Tersimpan" : "Belum tersimpan"}
              </p>
              {secretKey === "ai_api_key" && (
                <p>
                  Kunci lama ini tidak mengaktifkan penyedia AI. Gunakan{" "}
                  <a href="/dashboard/advanced">Pengaturan penyedia AI</a> untuk
                  konfigurasi aktif.
                </p>
              )}
              {secretKey === "drive_access_token" && (
                <p>
                  Token tersimpan tidak otomatis mengaktifkan integrasi Drive.
                  Adaptor tetap mengikuti konfigurasi server.
                </p>
              )}
              <label>
                Nilai kredensial baru
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={10000}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </label>
              <Button disabled={secret.length < 8}>
                Simpan kredensial baru
              </Button>
            </form>
            <section
              className="settings-section stack"
              aria-label="Uji koneksi SMTP"
            >
              <h2>Uji SMTP tersimpan</h2>
              <p>
                Uji koneksi memakai email dan App password tersimpan saat
                pekerjaan diproses, tanpa mengirim pesan.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !smtpReady ||
                  draft.smtp_sender !== server.smtp_sender ||
                  !!secret
                }
                onClick={() => void mutate("smtp_probe")}
              >
                Jadwalkan uji koneksi SMTP
              </Button>
              {!smtpReady && (
                <p className="muted">
                  Uji memerlukan layanan email aktif, email pengirim dan App password
                  yang sudah tersimpan.
                </p>
              )}
              {draft.smtp_sender !== server.smtp_sender && (
                <p className="muted">
                  Simpan perubahan email pengirim terlebih dahulu.
                </p>
              )}
              {probeId && (
                <p>
                  Nomor pekerjaan: <code>{probeId}</code> ·{" "}
                  <a href="/dashboard/jobs">Lihat hasil uji</a>
                </p>
              )}
            </section>
          </fieldset>
          <nav
            className="actions settings-links"
            aria-label="Pengaturan terkait"
          >
            <a href="/dashboard/exams">Periode input dan target soal</a>
            <a href="/dashboard/results">Kop dan template laporan</a>
            <a href="/dashboard/advanced">Penyedia AI</a>
          </nav>
        </>
      )}
      <Dialog
        open={confirmReload}
        onOpenChange={(v) => {
          if (!lock.current) setConfirmReload(v);
        }}
        title="Muat ulang dan abaikan draf?"
        description="Perubahan pengaturan dan kredensial yang belum disimpan akan dikosongkan."
        className="settings-dialog"
      >
        <div className="actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmReload(false)}
          >
            Lanjutkan mengedit
          </Button>
          <Button
            type="button"
            onClick={() => {
              setConfirmReload(false);
              setSecret("");
              setMessage("");
              setError("");
              void load();
            }}
          >
            Abaikan draf dan muat ulang
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
