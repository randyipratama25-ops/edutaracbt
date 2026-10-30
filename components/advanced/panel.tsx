"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Button } from "../ui/button";
import { api } from "../operations/shared";
import { checkLabels, type Overview } from "../../lib/advanced/schema";
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
    [message, setMessage] = useState("");
  const [candidate, setCandidate] = useState(""),
    [platform, setPlatform] = useState("Windows"),
    [device, setDevice] = useState(""),
    [version, setVersion] = useState(""),
    [checks, setChecks] = useState(emptyChecks),
    [notes, setNotes] = useState(""),
    [evidence, setEvidence] = useState(""),
    [local, setLocal] = useState<string | null>(null);
  const sequence = useRef(0),
    lock = useRef(false),
    retry = useRef<{ signature: string; id: string } | null>(null);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true);
    try {
      const d = await api<Overview & { candidate_sha?: string }>(
        `/api/advanced?page=${page}`,
      );
      if (sequence.current === id) {
        setData(d);
        setCandidate((c) => c || d.candidate_sha || "");
      }
    } catch (e) {
      if (sequence.current === id) {
        setData(null);
        setMessage(e instanceof Error ? e.message : "Gagal memuat evaluasi.");
      }
    } finally {
      if (sequence.current === id) setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    const tracker = sequence;
    void load();
    return () => {
      tracker.current++;
    };
  }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
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
        evidence_ref: evidence,
      };
      const signature = JSON.stringify(input);
      if (retry.current?.signature !== signature)
        retry.current = { signature, id: crypto.randomUUID() };
      await api("/api/advanced", { ...input, request_id: retry.current.id });
      retry.current = null;
      setChecks(emptyChecks());
      setNotes("");
      setEvidence("");
      await load();
      setMessage(
        "Hasil pengamatan tercatat. Riwayat dipertahankan; catatan ini tidak mewajibkan SEB atau mengesahkan penerimaan operasional.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Pencatatan gagal.");
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
    result.push(
      `canvas: ${document.createElement("canvas").getContext("2d") ? "tersedia" : "tidak tersedia"}`,
    );
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
      <p role="status" aria-live="polite">
        {message}
      </p>
      <section className="panel stack">
        <h2>Asisten koreksi AI</h2>
        <span className="role-badge">Nonaktif</span>
        <p>
          Sesuai pilihan pengelola, jawaban tidak dikirim ke penyedia AI.
          Koreksi rubrik dan moderasi tetap tersedia.
        </p>
        <p className="muted">
          Aktivasi di masa depan memerlukan pilihan penyedia, evaluasi hasil dan
          persetujuan penggunaan data. Saran AI tetap perlu keputusan penilai
          sebelum menjadi nilai resmi.
        </p>
        <Link href="/dashboard/grading">Buka koreksi dan moderasi</Link>
      </section>
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
        <p className="muted">
          Berkas uji tidak dienkripsi dan tidak memvalidasi Browser Exam
          Key/Config Key. Petunjuk browser dapat dipalsukan; hasil deteksi bukan
          bukti keamanan SEB.
        </p>
        {local && <p role="status">{local}</p>}
        <p>
          Uji login, soal/rumus, media, canvas, pemulihan koneksi dan submit
          pada setiap kombinasi perangkat serta versi SEB. Catat hanya hasil
          yang benar-benar diamati.
        </p>
      </section>
      <section className="panel stack">
        <h2>Pertukaran nilai XLSX dan PDF</h2>
        <p>
          Di Hasil atau Analitik, pilih peserta berizin, jenis laporan{" "}
          <strong>Pertukaran nilai</strong>, lalu XLSX atau PDF. ID
          peserta/ujian/attempt dan revisi ledger membantu pencocokan. Nilai
          yang belum final dibiarkan kosong, sedangkan nilai nol final tetap
          nol.
        </p>
        <p className="muted">
          Ekspor memakai izin laporan dan snapshot revisi yang sama; tidak
          mengirim data ke LMS atau layanan lain.
        </p>
        <div className="actions">
          <Link href="/dashboard/results">Hasil dan ekspor nilai</Link>
          <Link href="/dashboard/analytics">Analitik dan laporan</Link>
        </div>
      </section>
      <section className="panel stack">
        <h2>Catat hasil evaluasi perangkat</h2>
        <form className="stack" onSubmit={(e) => void save(e)} aria-busy={busy}>
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
                pattern="[a-zA-Z0-9_./ \-]+"
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
            <Button disabled={busy}>Simpan hasil evaluasi</Button>
          </fieldset>
        </form>
      </section>
      <section className="panel stack">
        <div className="actions">
          <h2>Riwayat evaluasi</h2>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              setMessage("");
              void load();
            }}
          >
            Muat ulang evaluasi
          </Button>
        </div>
        {loading ? (
          <p role="status">Memuat evaluasi…</p>
        ) : data ? (
          <>
            {!data.rows.length && (
              <p>Belum ada pengamatan perangkat yang dicatat.</p>
            )}
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
            <div className="actions">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Sebelumnya
              </Button>
              <span>
                Halaman {page} / {Math.max(1, Math.ceil(data.total / 50))}
              </span>
              <Button
                variant="outline"
                disabled={page * 50 >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </>
        ) : (
          <p>Evaluasi belum tersedia. Coba muat ulang.</p>
        )}
      </section>
    </div>
  );
}
