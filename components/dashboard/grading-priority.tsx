"use client";
import Link from "next/link";
import { Button } from "../ui/button";
import { useSummary } from "./use-summary";
import { pendingSchema, formatCount } from "../../lib/dashboard/summary";
export function GradingPriority() {
  const { data, loading, error, refresh } = useSummary(
    "/api/results?state=pending&page=1",
    pendingSchema,
  );
  return (
    <section
      className="panel stack grading-summary"
      aria-labelledby="grading-summary-title"
    >
      <div className="summary-heading">
        <h2 id="grading-summary-title">Koreksi dalam cakupan Anda</h2>
        <Button
          loading={loading}
          type="button"
          variant="outline"
          disabled={loading}
          onClick={refresh}
          aria-label="Perbarui ringkasan koreksi"
        >
          {loading ? "Memuat…" : "Perbarui"}
        </Button>
      </div>
      <div role="status">
        {loading ? (
          <p>Memuat koreksi tertunda…</p>
        ) : error ? (
          <p>Ringkasan koreksi belum dapat dimuat. Coba perbarui.</p>
        ) : null}
      </div>
      {data && (
        <>
          <p>
            <strong className="metric">{formatCount(data.total)}</strong>
            {data.total === 0
              ? "Tidak ada hasil peserta yang menunggu koreksi esai."
              : "hasil peserta masih menunggu koreksi esai."}
          </p>
          {(loading || error) && (
            <p className="muted">
              Menampilkan data terakhir yang berhasil dimuat.
            </p>
          )}
        </>
      )}
      <Link href="/dashboard/grading" className="summary-link">
        Buka antrean koreksi
      </Link>
    </section>
  );
}
