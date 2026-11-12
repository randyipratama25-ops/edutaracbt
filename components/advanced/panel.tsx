"use client";
import { FeedbackMessage, StateCard } from "../feedback/state";
import { ValidatedForm } from "../feedback/validated-form";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Button } from "../ui/button";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import {
  checkLabels,
  evaluationList,
  evaluationReceipt,
  evaluationSchema,
  type Overview,
} from "../../lib/advanced/schema";
const keys = Object.keys(checkLabels) as (keyof typeof checkLabels)[];
const emptyChecks = () =>
  Object.fromEntries(keys.map((k) => [k, ""])) as Record<
    keyof typeof checkLabels,
    string
  >;
export function AdvancedPanel() {
  const [data, setData] = useState<Overview | null>(null),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{
      tone: "success" | "error";
      text: string;
    } | null>(null),
    [loadError, setLoadError] = useState("");
  const [candidate, setCandidate] = useState(""),
    [platform, setPlatform] = useState("Windows"),
    [device, setDevice] = useState(""),
    [version, setVersion] = useState(""),
    [checks, setChecks] = useState(emptyChecks),
    [notes, setNotes] = useState(""),
    [evidence, setEvidence] = useState(""),
    [local, setLocal] = useState<string | null>(null);
  const read = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const retry = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    setLoading(true);
    setLoadError("");
    try {
      const result = await clientRequest(
        `/api/advanced?page=${page}`,
        undefined,
        evaluationList,
        controller,
      );
      if (read.current !== controller) return;
      const last = Math.max(1, Math.min(10000, Math.ceil(result.total / 50)));
      if (page > last) {
        setPage(last);
        return;
      }
      setData(result);
      setCandidate((value) => value || result.candidate_sha || "");
    } catch (error) {
      if (read.current !== controller) return;
      setData(null);
      setLoadError(
        error instanceof Error ? error.message : "Gagal memuat evaluasi.",
      );
    } finally {
      if (read.current === controller) {
        read.current = null;
        setLoading(false);
      }
    }
  }, [page]);
  useEffect(() => {
    void load();
    return () => {
      const controller = read.current;
      read.current = null;
      controller?.abort();
    };
  }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      if (keys.some((k) => !checks[k]))
        throw Error("Isi hasil aktual untuk seluruh skenario.");
      const input = {
        action: "record",
        candidate_sha: candidate,
        platform,
        device_label: device,
        seb_version: version,
        checks: Object.fromEntries(keys.map((k) => [k, checks[k] === "pass"])),
        notes,
        evidence_ref: evidence.trim(),
      };
      const signature = JSON.stringify(input);
      const id = retry.current.get(signature) ?? crypto.randomUUID();
      const parsed = evaluationSchema.safeParse({ ...input, request_id: id });
      if (!parsed.success)
        throw Error(
          "Periksa commit, perangkat, versi SEB, catatan, dan referensi artefak.",
        );
      retry.current.set(signature, id);
      try {
        await clientRequest(
          "/api/advanced",
          parsed.data,
          evaluationReceipt,
          new AbortController(),
          {
            mutation: true,
            uncertainMessage:
              "Pencatatan belum dapat dipastikan. Kirim ulang isian yang sama untuk melanjutkan permintaan sebelumnya.",
          },
        );
      } catch (error) {
        if (error instanceof ClientRequestError && !error.uncertain)
          retry.current.delete(signature);
        throw error;
      }
      retry.current.delete(signature);
      setChecks(emptyChecks());
      setNotes("");
      setEvidence("");
      setMessage({
        tone: "success",
        text: "Hasil pengamatan tercatat. Catatan tersedia di riwayat evaluasi.",
      });
      if (page === 1) await load();
      else setPage(1);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Pencatatan gagal.",
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function probe() {
    const result: string[] = [
      `HTTPS: ${isSecureContext ? "ya" : "belum"}`,
      `jaringan: ${navigator.onLine ? "terdeteksi" : "offline"}`,
    ];
    try {
      const key = "edutara:seb-probe:" + crypto.randomUUID();
      localStorage.setItem(key, "test");
      localStorage.removeItem(key);
      result.push("penyimpanan lokal: tersedia");
    } catch {
      result.push("penyimpanan lokal: dibatasi");
    }
    let canvas = false;
    try {
      canvas = Boolean(document.createElement("canvas").getContext("2d"));
    } catch {
      // Device policy may block access to canvas.
    }
    result.push(`canvas: ${canvas ? "tersedia" : "tidak tersedia"}`);
    const seb = (
      window as unknown as { SafeExamBrowser?: { version?: unknown } }
    ).SafeExamBrowser;
    result.push(
      `API SEB: ${typeof seb?.version === "string" ? "terdeteksi" : "tidak terdeteksi"}`,
    );
    setLocal(result.join(" · "));
  }
  return (
    <div className="stack">
      <section className="panel stack">
        <h2>Uji kompatibilitas Safe Exam Browser</h2>
        <p>
          Gunakan perangkat uji dan akun simulasi. Konfigurasi ini membuka login
          aplikasi, dapat ditutup, dan belum menjadi syarat siswa mengikuti
          ujian.
        </p>
        <div className="actions">
          <Button asChild variant="outline">
            <a href="/api/advanced/seb">Unduh konfigurasi uji SEB</a>
          </Button>
          <Button variant="outline" onClick={probe}>
            Periksa browser ini
          </Button>
        </div>
        {local && (
          <FeedbackMessage tone="info" role="status">
            {local}
          </FeedbackMessage>
        )}
      </section>
      <section className="panel stack">
        <h2>Pertukaran nilai XLSX dan PDF</h2>
        <p>
          Di Hasil atau Analitik, pilih peserta berizin, jenis laporan{" "}
          <strong>Pertukaran nilai</strong>, lalu XLSX atau PDF. ID peserta,
          ujian, pengerjaan, dan revisi nilai membantu pencocokan. Nilai yang
          belum final dibiarkan kosong, sedangkan nilai nol final tetap nol.
        </p>
        <p className="muted">
          Ekspor mengikuti hak akses dan revisi nilai yang sama; tidak mengirim
          data ke LMS atau layanan lain.
        </p>
        <div className="actions">
          <Link href="/dashboard/results">Hasil dan ekspor nilai</Link>
          <Link href="/dashboard/analytics">Analitik dan laporan</Link>
        </div>
      </section>
      <section className="panel stack">
        <h2>Catat hasil evaluasi perangkat</h2>
        <ValidatedForm
          className="stack"
          onSubmit={(e) => void save(e)}
          aria-busy={busy}
        >
          <fieldset className="stack" disabled={busy}>
            <legend>Pengamatan petugas</legend>
            <div className="form-grid">
              <label>
                Commit kandidat (40 karakter)
                <input
                  required
                  pattern="[a-f0-9]{40}"
                  maxLength={40}
                  value={candidate}
                  onChange={(e) => setCandidate(e.target.value)}
                />
              </label>
              <label>
                Platform
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  {["Windows", "macOS", "iOS", "other"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Label perangkat uji
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Contoh: Laptop lab 01"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                />
              </label>
              <label>
                Versi SEB yang diuji
                <input
                  required
                  maxLength={50}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </label>
              {keys.map((k) => (
                <label key={k}>
                  {checkLabels[k]}
                  <select
                    required
                    value={checks[k]}
                    onChange={(e) =>
                      setChecks((c) => ({ ...c, [k]: e.target.value }))
                    }
                  >
                    <option value="">Pilih hasil aktual</option>
                    <option value="pass">Lulus pengamatan</option>
                    <option value="fail">Gagal / terkendala</option>
                  </select>
                </label>
              ))}
            </div>
            <label>
              Catatan hasil dan tindak lanjut
              <textarea
                required
                minLength={10}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <label>
              Referensi artefak privat
              <input
                required
                minLength={5}
                maxLength={200}
                pattern={String.raw`[a-zA-Z0-9_.\/ \-]+`}
                placeholder="Contoh: uat/lab-01/laporan.pdf"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </label>
            <p className="muted">
              Gunakan referensi berkas, tanpa URL bertoken, password, jawaban
              atau identitas peserta. Catatan tidak dapat diedit atau dihapus;
              buat catatan baru untuk pengujian ulang.
            </p>
            <Button loading={busy} disabled={busy}>
              {busy ? "Menyimpan hasil…" : "Simpan hasil evaluasi"}
            </Button>
            {message && (
              <FeedbackMessage tone={message.tone}>
                {message.text}
              </FeedbackMessage>
            )}
          </fieldset>
        </ValidatedForm>
      </section>
      <section className="panel stack">
        <div className="actions">
          <h2>Riwayat evaluasi</h2>
          <Button
            variant="outline"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            Muat ulang evaluasi
          </Button>
        </div>
        {loading ? (
          <FeedbackMessage tone="loading" role="status">
            Memuat evaluasi…
          </FeedbackMessage>
        ) : data ? (
          <>
            {!data.rows.length && (
              <StateCard
                kind="empty"
                heading="h3"
                title="Belum ada pengamatan perangkat"
                description="Isi formulir evaluasi untuk menambahkan catatan pertama."
              />
            )}
            {data.rows.length > 0 && (
              <ul className="moderation-list">
                {data.rows.map((r) => (
                  <li key={r.id}>
                    <div>
                      <strong>
                        {r.device_label} · {r.platform} · SEB {r.seb_version}
                      </strong>
                      <p>
                        {Object.values(r.checks).every(Boolean)
                          ? "Seluruh skenario dilaporkan lulus"
                          : "Ada skenario yang perlu tindak lanjut"}
                      </p>
                      <p>{r.notes}</p>
                      <small>
                        {r.candidate_sha} ·{" "}
                        {new Date(r.recorded_at).toLocaleString("id-ID", {
                          timeZone: "Asia/Jakarta",
                        })}{" "}
                        WIB
                      </small>
                      <p>Artefak: {r.evidence_ref}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.total > 50 && (
              <nav className="actions" aria-label="Halaman riwayat evaluasi">
                <Button
                  variant="outline"
                  disabled={busy || page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Sebelumnya
                </Button>
                <span>
                  Halaman {page} / {Math.min(10000, Math.ceil(data.total / 50))}
                </span>
                <Button
                  variant="outline"
                  disabled={busy || page >= 10000 || page * 50 >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </Button>
              </nav>
            )}
          </>
        ) : (
          <StateCard
            kind="error"
            heading="h3"
            role="alert"
            title="Evaluasi belum tersedia"
            description={loadError}
          />
        )}
      </section>
    </div>
  );
}
