"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { z } from "zod";
import Link from "next/link";
import { FeedbackMessage, StateCard } from "../feedback/state";
import { ValidatedForm } from "../feedback/validated-form";
import { Button } from "../ui/button";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import {
  operationalChecks,
  healthSchema,
  drillSchema,
  type HealthView,
} from "../../lib/operational/health";
import { jobDate } from "../../lib/system/jobs";
const date = (v: string | null) => (v ? jobDate(v) : "Belum tersedia");
export function OperationalHealth() {
  const [data, setData] = useState<HealthView | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [message, setMessage] = useState(""),
    [tone, setTone] = useState<"info" | "success" | "error">("info"),
    [now, setNow] = useState(() => Date.now()),
    [uncertain, setUncertain] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null),
    mounted = useRef(false),
    lock = useRef(false),
    generation = useRef(0),
    read = useRef<AbortController | null>(null),
    write = useRef<AbortController | null>(null),
    flight = useRef<Promise<boolean> | null>(null),
    retry = useRef<{ key: string; id: string } | null>(null);
  const load = useCallback((force = false): Promise<boolean> => {
    if (!mounted.current || (!force && lock.current))
      return Promise.resolve(false);
    if (flight.current) return flight.current;
    const seq = ++generation.current,
      c = new AbortController();
    read.current = c;
    setLoading(true);
    const promise = (async () => {
      try {
        const next = await clientRequest(
          "/api/operational",
          undefined,
          healthSchema,
          c,
        );
        if (!mounted.current || seq !== generation.current) return false;
        setData(next);
        setNow(Date.now());
        setError("");
        setUncertain(false);
        return true;
      } catch (e) {
        if (mounted.current && seq === generation.current)
          setError(
            e instanceof Error
              ? e.message
              : "Kondisi layanan belum dapat dimuat.",
          );
        return false;
      } finally {
        if (mounted.current && seq === generation.current) {
          setLoading(false);
          flight.current = null;
        }
      }
    })();
    flight.current = promise;
    return promise;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const sequence = generation;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false)
        await load();
      if (active) timer = setTimeout(() => void tick(), 60000);
    };
    void tick();
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false)
        void load();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      active = false;
      mounted.current = false;
      sequence.current++;
      read.current?.abort();
      write.current?.abort();
      flight.current = null;
      clearTimeout(timer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [load]);
  async function record(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current || uncertain) return;
    const f = new FormData(e.currentTarget),
      completed = new Date(String(f.get("completed_at")));
    let input: z.infer<typeof drillSchema>;
    try {
      if (!Number.isFinite(completed.getTime())) throw Error();
      const raw = {
        action: "record",
        backup_id: String(f.get("backup_id")),
        backup_checksum: String(f.get("backup_checksum")),
        completed_at: completed.toISOString(),
        duration_seconds: Number(f.get("duration_seconds")),
        outcome: String(f.get("outcome")),
        evidence: String(f.get("evidence")),
        notes: String(f.get("notes")),
        confirmation: String(f.get("confirmation")),
      };
      const key = JSON.stringify(raw);
      if (retry.current?.key !== key)
        retry.current = { key, id: crypto.randomUUID() };
      input = drillSchema.parse({ ...raw, request_id: retry.current.id });
    } catch {
      setTone("error");
      setMessage(
        "Periksa ID backup, checksum, waktu, durasi, bukti, catatan, dan konfirmasi.",
      );
      return;
    }
    lock.current = true;
    generation.current++;
    read.current?.abort();
    flight.current = null;
    setLoading(false);
    setBusy(true);
    setMessage("");
    const c = new AbortController();
    write.current = c;
    try {
      await clientRequest(
        "/api/operational",
        input,
        z.object({ saved: z.literal(true) }),
        c,
        { mutation: true },
      );
      if (!mounted.current) return;
      retry.current = null;
      setOpen(false);
      setUncertain(false);
      const refreshed = await load(true);
      if (!mounted.current) return;
      setTone("success");
      setMessage(
        "Catatan latihan tersimpan; bukti tetap perlu diverifikasi penanggung jawab." +
          (refreshed
            ? ""
            : " Riwayat terbaru belum dapat dimuat. Periksa kembali tanpa mengirim ulang catatan."),
      );
      requestAnimationFrame(() => toggle.current?.focus());
    } catch (e) {
      if (mounted.current) {
        setUncertain(e instanceof ClientRequestError && e.uncertain);
        setTone("error");
        setMessage(e instanceof Error ? e.message : "Catatan gagal disimpan.");
      }
    } finally {
      lock.current = false;
      write.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  const checks = data ? operationalChecks(data, now) : [];
  return (
    <section
      className="panel stack jobs-health"
      aria-label="Pemantauan operasional"
    >
      <div className="summary-heading">
        <div>
          <h2>Kondisi layanan</h2>
          <p className="muted">
            Periksa kesiapan otomasi, backup, dan latihan pemulihan.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Periksa sekarang
        </Button>
      </div>
      {loading && (
        <FeedbackMessage tone="loading" role="status">
          Memeriksa kondisi…
        </FeedbackMessage>
      )}
      {error && (
        <FeedbackMessage tone="error" role="alert">
          {error}{" "}
          {data
            ? "Ringkasan berikut menggunakan data terakhir; periksa kembali."
            : "Coba periksa kembali."}
        </FeedbackMessage>
      )}
      {!loading && !data && !error && (
        <StateCard
          kind="empty"
          title="Kondisi belum tersedia"
          description="Periksa koneksi dan gunakan Periksa sekarang."
        />
      )}
      {data && (
        <>
          <p className="muted">Diperiksa {date(data.observed_at)}</p>
          <p className="jobs-health-summary">
            <strong>
              {checks.filter((c) => !c.passed).length} dari {checks.length}{" "}
              pemeriksaan perlu tindak lanjut
            </strong>
          </p>
          <details className="jobs-health-details">
            <summary>Lihat rincian pemeriksaan</summary>
            <div className="operational-grid">
              {checks.map((c) => (
                <article className="panel stack" key={c.title}>
                  <h3>{c.title}</h3>
                  <strong>
                    {c.passed ? "Terpenuhi" : "Perlu tindak lanjut"}
                  </strong>
                  <p>{c.detail}</p>
                  {c.href && (
                    <Link href={c.href}>Buka pemeriksaan terkait</Link>
                  )}
                </article>
              ))}
            </div>
            <p className="muted">
              Kontak penjadwal: {date(data.heartbeat_at)} · Latihan berhasil:{" "}
              {date(data.last_passed_drill_at)}
            </p>
          </details>
        </>
      )}
      <div className="actions">
        <Button
          ref={toggle}
          variant="outline"
          disabled={busy}
          aria-expanded={open}
          aria-controls="recovery-drill-form"
          onClick={() => setOpen((v) => !v)}
        >
          Catat latihan pemulihan
        </Button>
        <Link href="/dashboard/acceptance">Pemeriksaan penerimaan</Link>
      </div>
      <FeedbackMessage tone={tone} role={tone === "error" ? "alert" : "status"}>
        {message}
      </FeedbackMessage>
      {open && (
        <ValidatedForm
          id="recovery-drill-form"
          className="stack"
          onSubmit={(e) => void record(e)}
          aria-label="Catatan latihan pemulihan"
        >
          <p>
            Catat hasil pemulihan backup pada database terisolasi. Formulir ini
            tidak menjalankan restore dan tidak memverifikasi bukti secara
            otomatis.
          </p>
          <fieldset
            disabled={busy || uncertain}
            className="jobs-controls stack"
          >
            <div className="jobs-drill-grid">
              <label>
                ID backup
                <input
                  name="backup_id"
                  required
                  pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                  maxLength={36}
                  defaultValue={data?.backup?.id || ""}
                />
              </label>
              <label>
                SHA-256 manifest
                <input
                  name="backup_checksum"
                  required
                  pattern="[a-f0-9]{64}"
                  maxLength={64}
                  defaultValue={data?.backup?.checksum || ""}
                />
              </label>
              <label>
                Waktu selesai (zona perangkat)
                <input name="completed_at" type="datetime-local" required />
              </label>
              <label>
                Durasi (detik)
                <input
                  name="duration_seconds"
                  type="number"
                  min={1}
                  max={86400}
                  step={1}
                  required
                />
              </label>
              <label>
                Hasil
                <select name="outcome">
                  <option value="failed">Gagal / perlu perbaikan</option>
                  <option value="passed">Berhasil</option>
                </select>
              </label>
            </div>
            <label>
              Lokasi bukti / nomor laporan
              <input name="evidence" minLength={5} maxLength={300} required />
            </label>
            <label>
              Hasil perbandingan data/media, uji akses dan tindak lanjut
              <textarea name="notes" minLength={10} maxLength={2000} required />
            </label>
            <label>
              Ketik KONFIRMASI
              <input
                name="confirmation"
                pattern="KONFIRMASI"
                autoComplete="off"
                required
              />
            </label>
            <div className="actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Tutup formulir
              </Button>
              <Button loading={busy}>{busy ? "Menyimpan…" : "Simpan catatan latihan"}</Button>
            </div>
          </fieldset>
          {uncertain && (
            <Button
              type="button"
              disabled={loading || busy}
              onClick={() => void load()}
            >
              Periksa status sebelum mengulang
            </Button>
          )}
        </ValidatedForm>
      )}
      {!!data?.drills.length && (
        <details>
          <summary>Riwayat {data.drills.length} latihan terakhir</summary>
          <ul className="stack jobs-drills">
            {data.drills.map((d) => (
              <li key={d.id}>
                <strong>{d.outcome === "passed" ? "Berhasil" : "Gagal"}</strong>{" "}
                · {date(d.completed_at)} · {d.duration_seconds} detik
                <p>{d.evidence}</p>
                <p>{d.notes}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
