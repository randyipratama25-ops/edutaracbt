"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "../ui/button";
import { api } from "../operations/shared";
import {
  humanChecks,
  technicalChecks,
  type Snapshot,
} from "../../lib/acceptance/readiness";
export function AcceptancePanel() {
  const [data, setData] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const d = await api<Snapshot>("/api/acceptance");
      if (sequence.current === id) { setData(d); setNow(Date.now()); }
    } catch (e) {
      if (sequence.current === id) {
        setData(null);
        setError(e instanceof Error ? e.message : "Gagal memuat ringkasan.");
      }
    } finally {
      if (sequence.current === id) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const tracker = sequence;
    void load();
    return () => {
      tracker.current++;
    };
  }, [load]);
  // Recompute age on screen; an old passing snapshot must not remain visually current.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const checks = data ? technicalChecks(data, now) : [];
  function download() {
    if (!data) return;
    const report = {
      format: "edutara-operational-observation-v1",
      exported_at: new Date().toISOString(),
      snapshot: data,
      technical_checks: technicalChecks(data),
      required_evidence: humanChecks.map((x) => ({ ...x, status: "pending" })),
      operational_accepted: false,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "edutara-penerimaan-operasional.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="stack">
      <div className="actions">
        <Button disabled={loading} onClick={() => void load()}>
          Muat ulang pemeriksaan
        </Button>
        <Button
          variant="outline"
          disabled={!data || loading}
          onClick={download}
        >
          Unduh ringkasan
        </Button>
      </div>
      <p className="notice">
        Penerimaan operasional belum disahkan. Ringkasan teknis ini membantu
        petugas menyiapkan bukti; pengesahan dilakukan setelah UAT dan
        pemeriksaan artefak asli.
      </p>
      {loading && <p role="status">Memuat kondisi operasional…</p>}
      {error && (
        <p role="alert">
          {error} Gunakan tombol muat ulang untuk mencoba kembali.
        </p>
      )}
      {data && !loading && (
        <>
          <p className="muted">
            Diperiksa:{" "}
            {new Date(data.observed_at).toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            })}{" "}
            WIB · {checks.filter((c) => c.passed).length}/{checks.length} sinyal
            teknis terpenuhi.
          </p>
          <section className="stack" aria-label="Kondisi teknis">
            {checks.map((c) => (
              <article className="panel stack" key={c.title}>
                <div className="actions">
                  <h2>{c.title}</h2>
                  <span className="role-badge">
                    {c.passed ? "Terpenuhi" : "Perlu tindak lanjut"}
                  </span>
                </div>
                <p>{c.detail}</p>
                {c.href && <Link href={c.href}>Buka modul terkait</Link>}
              </article>
            ))}
          </section>
        </>
      )}
      <section className="panel stack">
        <h2>Bukti penerimaan yang wajib dilengkapi</h2>
        <p>
          Setiap bukti mencantumkan kandidat SHA, lingkungan, waktu, penguji,
          hasil aktual dan lokasi artefak. Tidak ada skenario yang dianggap
          lulus hanya karena fiturnya tersedia.
        </p>
        <ol className="stack">
          {humanChecks.map((c) => (
            <li key={c.id}>
              <strong>{c.title} — menunggu bukti</strong>
              <p>{c.detail}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="panel stack">
        <h2>Jika terjadi gangguan</h2>
        <p>
          Hentikan publikasi hasil yang meragukan, amankan jawaban dan
          inventaris terbaru, catat waktu serta dampak, lalu hubungi penanggung
          jawab. Rollback aplikasi harus mempertahankan database dan jawaban
          terbaru.
        </p>
        <div className="actions">
          <Link href="/dashboard/monitor">Monitoring peserta</Link>
          <Link href="/dashboard/jobs">Pekerjaan dan backup</Link>
          <Link href="/dashboard/audit">Audit aktivitas</Link>
        </div>
      </section>
    </div>
  );
}
