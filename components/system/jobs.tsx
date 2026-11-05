"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { MoreActions } from "../ui/more-actions";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { HelpDisclosure } from "../ui/help-disclosure";
import { ListFilters, SearchField } from "../ui/list-filters";
import { FeedbackMessage, StateCard } from "../feedback/state";
import { ValidatedForm } from "../feedback/validated-form";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import { matchesSearch } from "../../lib/lists/search";
import {
  jobActions,
  jobDate,
  jobKinds,
  jobStatuses,
  jobOutcome,
  jobsSchema,
  partsSchema,
  type Job,
  type BackupPart,
} from "../../lib/system/jobs";
import { settingsReceipt } from "../../lib/system/contracts";
import { systemMutation } from "../../lib/system/validation";
type Decision = {
  action: "cancel_backup" | "resolve_email";
  id: string;
  resolution?: "sent" | "not_sent";
};
export function JobsPanel() {
  const [jobs, setJobs] = useState<Job[]>([]),
    [loaded, setLoaded] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [updated, setUpdated] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [tone, setTone] = useState<"info" | "success" | "error">("info"),
    [uncertain, setUncertain] = useState(false);
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1);
  const [decision, setDecision] = useState<Decision | null>(null),
    [reason, setReason] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [backupId, setBackupId] = useState(""),
    [parts, setParts] = useState<BackupPart[]>([]),
    [partsLoading, setPartsLoading] = useState(false),
    [partsError, setPartsError] = useState("");
  const mounted = useRef(false),
    lock = useRef(false),
    dialog = useRef(false),
    generation = useRef(0),
    partGeneration = useRef(0),
    read = useRef<AbortController | null>(null),
    partRead = useRef<AbortController | null>(null),
    write = useRef<AbortController | null>(null),
    flight = useRef<Promise<boolean> | null>(null),
    retry = useRef<{ key: string; id: string } | null>(null);
  const load = useCallback((force = false): Promise<boolean> => {
    if (!mounted.current || (!force && (lock.current || dialog.current)))
      return Promise.resolve(false);
    if (flight.current) return flight.current;
    const seq = ++generation.current,
      c = new AbortController();
    read.current = c;
    setLoading(true);
    const promise = (async () => {
      try {
        const next = await clientRequest(
          "/api/system?action=jobs",
          undefined,
          jobsSchema,
          c,
        );
        if (!mounted.current || seq !== generation.current) return false;
        setJobs(next);
        setLoaded(true);
        setError("");
        setUncertain(false);
        setUpdated(jobDate(new Date().toISOString()));
        return true;
      } catch (e) {
        if (mounted.current && seq === generation.current)
          setError(
            e instanceof Error
              ? e.message
              : "Daftar pekerjaan belum dapat dimuat.",
          );
        return false;
      } finally {
        if (mounted.current && seq === generation.current) {
          setLoading(false);
          flight.current = null;
          read.current = null;
        }
      }
    })();
    flight.current = promise;
    return promise;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const readSequence = generation,
      partsSequence = partGeneration;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false)
        await load();
      if (active) timer = setTimeout(() => void tick(), 5000);
    };
    void tick();
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false)
        void load();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      mounted.current = false;
      readSequence.current++;
      partsSequence.current++;
      read.current?.abort();
      partRead.current?.abort();
      write.current?.abort();
      flight.current = null;
      clearTimeout(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  function invalidate() {
    generation.current++;
    read.current?.abort();
    flight.current = null;
    setLoading(false);
  }
  function openDecision(next: Decision) {
    if (lock.current || flight.current || loading || error || uncertain) return;
    invalidate();
    dialog.current = true;
    setDecision(next);
    setReason("");
    setConfirmation("");
    setMessage("");
  }
  function closeDecision() {
    if (lock.current) return;
    dialog.current = false;
    setDecision(null);
    setMessage("");
    void load();
  }
  async function save(raw: Record<string, unknown>) {
    if (lock.current || flight.current || !loaded || error || uncertain) return;
    let input: z.infer<typeof systemMutation>;
    try {
      if (raw.action === "backup") {
        const key = JSON.stringify(raw);
        if (retry.current?.key !== key)
          retry.current = { key, id: crypto.randomUUID() };
        input = systemMutation.parse({ ...raw, request_id: retry.current.id });
      } else input = systemMutation.parse(raw);
    } catch {
      setTone("error");
      setMessage("Periksa alasan dan ketik KONFIRMASI dengan tepat.");
      return;
    }
    lock.current = true;
    invalidate();
    setBusy(true);
    setMessage("");
    const c = new AbortController();
    write.current = c;
    try {
      await clientRequest(
        "/api/system",
        input,
        settingsReceipt(input.action),
        c,
        { mutation: true },
      );
      if (!mounted.current) return;
      if (input.action === "backup") retry.current = null;
      dialog.current = false;
      setDecision(null);
      setUncertain(false);
      const refreshed = await load(true);
      if (!mounted.current) return;
      setTone(input.action === "cancel_backup" ? "success" : "info");
      setMessage(
        (input.action === "backup"
          ? "Permintaan backup diterima. Tunggu status Selesai sebelum mengunduh."
          : input.action === "retry"
            ? "Permintaan coba ulang diterima. Periksa pembaruan status."
            : input.action === "cancel_backup"
              ? "Backup dibatalkan. Data sumber tetap dipertahankan."
              : "Rekonsiliasi tercatat. Periksa pembaruan status pengiriman.") +
          (refreshed
            ? ""
            : " Status terbaru belum dapat dimuat; muat ulang sebelum tindakan berikutnya."),
      );
    } catch (e) {
      if (mounted.current) {
        const unknown = e instanceof ClientRequestError && e.uncertain;
        setUncertain(unknown);
        setTone("error");
        setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
      }
    } finally {
      lock.current = false;
      write.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  async function showParts(id: string) {
    if (lock.current) return;
    invalidate();
    dialog.current = true;
    const seq = ++partGeneration.current;
    partRead.current?.abort();
    const c = new AbortController();
    partRead.current = c;
    setBackupId(id);
    setParts([]);
    setPartsError("");
    setPartsLoading(true);
    try {
      const next = await clientRequest(
        "/api/system?action=parts&id=" + encodeURIComponent(id),
        undefined,
        partsSchema,
        c,
      );
      if (mounted.current && seq === partGeneration.current) setParts(next);
    } catch (e) {
      if (mounted.current && seq === partGeneration.current)
        setPartsError(
          e instanceof Error ? e.message : "Bagian backup belum dapat dimuat.",
        );
    } finally {
      if (mounted.current && seq === partGeneration.current)
        setPartsLoading(false);
    }
  }
  const visible = jobs.filter(
    (j) =>
      (!kind || j.kind === kind) &&
      (!status || j.status === status) &&
      matchesSearch(
        [
          j.id,
          jobKinds[j.kind],
          jobStatuses[j.status],
          jobOutcome(j.outcome),
          j.error || "",
        ].join(" "),
        search,
      ),
  );
  const pages = Math.max(1, Math.ceil(visible.length / 10)),
    current = Math.min(page, pages),
    shown = visible.slice((current - 1) * 10, current * 10),
    disabled = busy || loading || !!error || uncertain || !loaded;
  const active = [
    ...(search ? ["Pencarian: " + search] : []),
    ...(kind ? ["Jenis: " + jobKinds[kind as Job["kind"]]] : []),
    ...(status ? ["Status: " + jobStatuses[status as Job["status"]]] : []),
  ];
  function reset() {
    setSearch("");
    setKind("");
    setStatus("");
    setPage(1);
  }
  return (
    <section
      className="panel stack jobs-page"
      aria-label="Pekerjaan otomasi dan backup"
    >
      <div className="summary-heading">
        <div>
          <h2>Pekerjaan terbaru</h2>
        </div>
        <div className="actions">
          <Button
            disabled={disabled}
            onClick={() => void save({ action: "backup" })}
          >
            Buat backup manual
          </Button>
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Muat ulang
          </Button>
        </div>
      </div>
      <FeedbackMessage tone={tone} role={tone === "error" ? "alert" : "status"}>
        {message}
      </FeedbackMessage>
      {uncertain && (
        <FeedbackMessage tone="info" role="status">
          Periksa status terbaru sebelum mengulang tindakan. Permintaan backup
          yang sama akan memakai identitas sebelumnya.
        </FeedbackMessage>
      )}
      <HelpDisclosure>
        <p>
          Backup berisi data aplikasi, pengaturan, dan media. Password akun,
          sesi login, dan nilai kredensial rahasia tidak disertakan. Pemulihan
          akun memerlukan aktivasi ulang; pemulihan cadangan dilakukan pada
          lingkungan terpisah.
        </p>
        <p>
          ZIP tersedia sampai 50 MiB. Untuk backup lebih besar, unduh manifest
          dan setiap bagiannya.
        </p>
      </HelpDisclosure>
      <ListFilters
        label="pekerjaan"
        active={active}
        onReset={reset}
        total={loaded && !error ? visible.length : undefined}
        loading={loading}
        error={error}
      >
        <SearchField
          label="Cari pekerjaan"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <label>
          Jenis pekerjaan
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua jenis</option>
            {Object.entries(jobKinds).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status pekerjaan
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua status</option>
            {Object.entries(jobStatuses).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>
      <p className="muted jobs-freshness">
        {updated ? "Pembaruan terakhir: " + updated : "Menunggu data terbaru"}.
        Pembaruan otomatis setiap 5 detik saat halaman terlihat; dijeda selama
        konfirmasi.
      </p>
      {loading && !loaded ? (
        <StateCard
          kind="loading"
          title="Memuat pekerjaan"
          description="Menyiapkan status otomasi dan backup."
        />
      ) : !loaded && error ? (
        <StateCard
          kind="error"
          description={error}
          actions={
            <Button onClick={() => void load()}>Coba muat pekerjaan</Button>
          }
        />
      ) : loaded && !shown.length && !error ? (
        <StateCard
          kind={active.length ? "no-results" : "empty"}
          title={
            active.length
              ? "Tidak ada pekerjaan yang cocok"
              : "Belum ada pekerjaan"
          }
          description={
            active.length
              ? "Ubah kata kunci atau reset filter."
              : "Pekerjaan terjadwal dan backup manual akan tampil di sini."
          }
          actions={
            active.length ? (
              <Button variant="outline" onClick={reset}>
                Reset pencarian
              </Button>
            ) : undefined
          }
        />
      ) : (
        loaded && (
          <>
            {error && (
              <p className="muted">
                Daftar berikut adalah data terakhir yang berhasil dimuat.
                Tindakan dijeda hingga pembaruan berhasil.
              </p>
            )}
            <div
              className="table-wrap"
              role="region"
              aria-label="Daftar pekerjaan otomasi dan backup"
              tabIndex={0}
            >
              <table className="jobs-table" role="table">
                <caption className="sr-only">
                  Pekerjaan terbaru dalam WIB
                </caption>
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col" role="columnheader">
                      Pekerjaan / waktu
                    </th>
                    <th scope="col" role="columnheader">
                      Status / progres
                    </th>
                    <th scope="col" role="columnheader">
                      Hasil / tindakan
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {shown.map((j) => {
                    const a = jobActions(j);
                    return (
                      <tr key={j.id} role="row">
                        <th scope="row" role="rowheader">
                          <strong>{jobKinds[j.kind]}</strong>
                          <small>{jobDate(j.created_at)}</small>
                          <details>
                            <summary>ID pekerjaan</summary>
                            <code>{j.id}</code>
                          </details>
                        </th>
                        <td role="cell" data-label="Status dan progres">
                          <span className={"job-status job-status-" + j.status}>
                            {j.outcome === "cancelled"
                              ? "Dibatalkan"
                              : jobStatuses[j.status]}
                          </span>
                          <div className="jobs-progress">
                            <progress
                              max={100}
                              value={j.progress}
                              aria-label={
                                "Progres " + jobKinds[j.kind] + " " + j.id
                              }
                            />
                            <span>{j.progress}%</span>
                          </div>
                          <small>{j.attempts} percobaan</small>
                        </td>
                        <td role="cell" data-label="Hasil dan tindakan">
                          {j.outcome && <p>{jobOutcome(j.outcome)}</p>}
                          {j.error && <p className="jobs-error">{j.error}</p>}
                          <div className="actions">
                            {a.download && (
                              <MoreActions label="Unduh backup">
                                <a
                                  href={"/api/backups/download?id=" + j.id}
                                  className="button button-outline"
                                >
                                  Manifest
                                </a>
                                <a
                                  href={"/api/backups/export?id=" + j.id}
                                  className="button button-outline"
                                >
                                  ZIP (hingga 50 MiB)
                                </a>
                                <Button
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => void showParts(j.id)}
                                >
                                  Lihat bagian
                                </Button>
                              </MoreActions>
                            )}
                            {a.retry && (
                              <Button
                                variant="outline"
                                disabled={disabled}
                                onClick={() =>
                                  void save({ action: "retry", id: j.id })
                                }
                              >
                                Coba ulang
                              </Button>
                            )}
                            {a.cancel && (
                              <Button
                                variant="outline"
                                disabled={disabled}
                                onClick={() =>
                                  openDecision({
                                    action: "cancel_backup",
                                    id: j.id,
                                  })
                                }
                              >
                                Batalkan backup
                              </Button>
                            )}
                            {a.reconcile && (
                              <>
                                <p>
                                  Periksa kotak masuk dan catatan pengiriman
                                  sebelum memilih hasil.
                                </p>
                                <Button
                                  variant="outline"
                                  disabled={disabled}
                                  onClick={() =>
                                    openDecision({
                                      action: "resolve_email",
                                      id: j.id,
                                      resolution: "sent",
                                    })
                                  }
                                >
                                  Konfirmasi sudah terkirim
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={disabled}
                                  onClick={() =>
                                    openDecision({
                                      action: "resolve_email",
                                      id: j.id,
                                      resolution: "not_sent",
                                    })
                                  }
                                >
                                  Konfirmasi belum terkirim
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <nav
              className="actions jobs-pagination"
              aria-label="Halaman pekerjaan"
            >
              <Button
                variant="outline"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                Sebelumnya
              </Button>
              <span>
                Halaman {current} dari {pages}
              </span>
              <Button
                variant="outline"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                Berikutnya
              </Button>
            </nav>
            <p className="muted">
              {visible.length} dari {jobs.length} pekerjaan dimuat, maksimal 100
              terbaru. Pencarian hanya mencakup daftar ini.
            </p>
          </>
        )
      )}
      <Dialog
        open={!!backupId}
        onOpenChange={(v) => {
          if (!v) {
            partGeneration.current++;
            partRead.current?.abort();
            setBackupId("");
            setParts([]);
            dialog.current = false;
            void load();
          }
        }}
        title="Bagian backup"
        description="Unduh setiap bagian bersama manifest untuk memeriksa kelengkapan backup."
        className="jobs-dialog"
      >
        <p>
          ID backup: <code>{backupId}</code>
        </p>
        {partsLoading ? (
          <StateCard kind="loading" title="Memuat bagian backup" />
        ) : partsError ? (
          <StateCard
            kind="error"
            description={partsError}
            actions={
              <Button onClick={() => void showParts(backupId)}>
                Coba muat bagian
              </Button>
            }
          />
        ) : !parts.length ? (
          <StateCard
            kind="empty"
            title="Bagian belum tersedia"
            description="Muat ulang untuk memeriksa ketersediaan berkas."
          />
        ) : (
          <ul className="stack jobs-parts">
            {parts.map((p) => (
              <li key={p.number}>
                <a
                  href={
                    "/api/backups/download?id=" + backupId + "&part=" + p.number
                  }
                >
                  Bagian {p.number} · {p.kind} ·{" "}
                  {(p.bytes / 1024).toLocaleString("id-ID", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  KiB
                </a>
                <details>
                  <summary>Checksum SHA-256</summary>
                  <code>{p.sha256}</code>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      <Dialog
        open={!!decision}
        onOpenChange={(v) => {
          if (!v) closeDecision();
        }}
        title={
          decision?.action === "cancel_backup"
            ? "Batalkan backup"
            : "Rekonsiliasi pengiriman"
        }
        description={
          decision?.action === "cancel_backup"
            ? "Pekerjaan backup dihentikan. Data sumber tetap dipertahankan; backup ini tidak dapat dicoba ulang."
            : decision?.resolution === "sent"
              ? "Tandai email sebagai sudah terkirim setelah memeriksa bukti pengiriman."
              : "Email akan dijadwalkan ulang. Pastikan belum terkirim untuk mencegah pengiriman ganda."
        }
        className="jobs-dialog"
      >
        <p>
          ID pekerjaan: <code>{decision?.id}</code>
        </p>
        <ValidatedForm
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (decision) void save({ ...decision, reason, confirmation });
          }}
        >
          <fieldset
            className="jobs-controls stack"
            disabled={busy || uncertain}
          >
            <label>
              Alasan pemeriksaan
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label>
              Ketik KONFIRMASI
              <input
                required
                pattern="KONFIRMASI"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <FeedbackMessage
              tone={tone}
              role={tone === "error" ? "alert" : "status"}
            >
              {message}
            </FeedbackMessage>
            <div className="actions">
              <Button variant="outline" type="button" onClick={closeDecision}>
                Kembali
              </Button>
              <Button
                disabled={disabled}
                variant={
                  decision?.action === "cancel_backup"
                    ? "destructive"
                    : "default"
                }
              >
                {busy ? "Memproses…" : "Konfirmasi tindakan"}
              </Button>
            </div>
          </fieldset>
          {uncertain && (
            <Button type="button" onClick={closeDecision}>
              Periksa status terbaru
            </Button>
          )}
        </ValidatedForm>
      </Dialog>
    </section>
  );
}
