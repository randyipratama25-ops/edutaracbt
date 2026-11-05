"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, RefreshCw } from "lucide-react";
import { FeedbackMessage, StateCard } from "../feedback/state";
import { HelpDisclosure } from "../ui/help-disclosure";
import { Button } from "../ui/button";
import { clientRequest } from "../../lib/client/request";
import {
  humanChecks,
  snapshotSchema,
  technicalChecks,
  type Snapshot,
} from "../../lib/acceptance/readiness";

export function AcceptancePanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const active = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError("");
    setExportError("");
    try {
      const snapshot = await clientRequest(
        "/api/acceptance",
        undefined,
        snapshotSchema,
        controller,
      );
      if (active.current !== controller) return;
      setData(snapshot);
      setNow(Date.now());
    } catch (error) {
      if (active.current !== controller) return;
      setData(null);
      setError(
        error instanceof Error ? error.message : "Ringkasan gagal dimuat.",
      );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      const controller = active.current;
      active.current = null;
      controller?.abort();
    };
  }, [load]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);

  const checks = data ? technicalChecks(data, now) : [];
  const passing = checks.filter((check) => check.passed).length;

  function download() {
    if (!data || loading || active.current) return;
    setExportError("");
    const exportedAt = new Date();
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      const report = {
        format: "edutara-operational-observation-v1",
        exported_at: exportedAt.toISOString(),
        snapshot: data,
        technical_checks: technicalChecks(data, exportedAt.getTime()),
        required_evidence: humanChecks.map((check) => ({
          ...check,
          status: "pending",
        })),
        operational_accepted: false,
      };
      url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
      );
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "edutara-penerimaan-operasional.json";
      document.body.append(anchor);
      anchor.click();
    } catch {
      setExportError("Unduhan tidak dapat dimulai. Silakan coba kembali.");
    } finally {
      anchor?.remove();
      const exportedUrl = url;
      if (exportedUrl) setTimeout(() => URL.revokeObjectURL(exportedUrl), 1000);
    }
  }

  return (
    <div className="acceptance-workspace stack">
      <section className="panel stack" aria-labelledby="acceptance-status">
        <div className="summary-heading">
          <h2 id="acceptance-status">Status penerimaan</h2>
          <span className="role-badge">Menunggu bukti</span>
        </div>
        <p>
          Penerimaan operasional belum disahkan. Lengkapi bukti pengujian dan periksa artefak asli.
        </p>
        <div className="actions">
          <Button disabled={loading} onClick={() => void load()}>
            <RefreshCw size={16} aria-hidden="true" /> Muat ulang pemeriksaan
          </Button>
          <Button
            variant="outline"
            disabled={!data || loading}
            onClick={download}
          >
            <Download size={16} aria-hidden="true" /> Unduh ringkasan
          </Button>
        </div>
        {exportError && (
          <FeedbackMessage tone="error">{exportError}</FeedbackMessage>
        )}
      </section>

      {loading ? (
        <StateCard
          kind="loading"
          role="status"
          title="Memuat kondisi operasional"
          description="Sedang memeriksa kondisi layanan madrasah."
        />
      ) : error ? (
        <StateCard
          kind="error"
          role="alert"
          title="Pemeriksaan belum tersedia"
          description={error}
        />
      ) : (
        data && (
          <section
            className="stack"
            aria-labelledby="acceptance-technical"
            aria-label="Kondisi teknis"
          >
            <div className="panel stack">
              <h2 id="acceptance-technical">Kondisi teknis</h2>
              <p role="status">
                <strong>
                  {passing}/{checks.length}
                </strong>{" "}
                sinyal teknis terpenuhi · {checks.length - passing} perlu tindak
                lanjut.
              </p>
              <p className="muted">
                Data diperiksa pada{" "}
                <time dateTime={data.observed_at}>
                  {new Date(data.observed_at).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                  })}{" "}
                  WIB
                </time>
                .
              </p>
            </div>
            <ul className="acceptance-checks">
              {checks.map((check) => (
                <li className="panel stack" key={check.title}>
                  <div className="summary-heading">
                    <h3>{check.title}</h3>
                    <span className="role-badge">
                      {check.passed ? "Terpenuhi" : "Perlu tindak lanjut"}
                    </span>
                  </div>
                  <p>{check.detail}</p>
                  {check.href && (
                    <Link
                      className="summary-link"
                      href={check.href}
                      aria-label={`Buka modul terkait: ${check.title}`}
                    >
                      Buka modul terkait
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      )}

      <section className="panel stack">
        <h2>Bukti penerimaan yang wajib dilengkapi</h2>
        <HelpDisclosure>
          <p>
            Catat SHA kandidat rilis, lingkungan, waktu, penguji, hasil aktual,
            dan lokasi artefak untuk setiap bukti.
          </p>
        </HelpDisclosure>
        <ol className="acceptance-evidence stack">
          {humanChecks.map((check) => (
            <li key={check.id}>
              <strong>{check.title}</strong>
              <span className="role-badge">Menunggu bukti</span>
              <p>{check.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel stack">
        <h2>Jika terjadi gangguan</h2>
        <HelpDisclosure>
          <p>
            Hentikan publikasi hasil yang meragukan, amankan jawaban dan
            inventaris terbaru, lalu catat waktu serta dampak sebelum
            menghubungi penanggung jawab. Saat rollback, pertahankan database
            dan jawaban terbaru.
          </p>
        </HelpDisclosure>
        <div className="actions">
          <Button asChild variant="outline">
            <Link href="/dashboard/monitor">Monitoring peserta</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/jobs">Pekerjaan dan backup</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/audit">Audit aktivitas</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
