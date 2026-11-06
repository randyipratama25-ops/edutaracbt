"use client";
import {StateCard} from "../feedback/state";
import Link from "next/link";
import { Button } from "../ui/button";
import { useSummary } from "../dashboard/use-summary";
import {
  agendaSchema,
  summarizeAgenda,
  formatAgendaTime,
  formatCount,
} from "../../lib/dashboard/summary";
export function Workbench({ role = "admin" }: { role?: "admin" | "teacher" }) {
  const { data, loading, error, refresh } = useSummary(
    "/api/workflow",
    agendaSchema,
  );
  const summary = data ? summarizeAgenda(data.exams) : null;
  return (
    <section
      className="panel stack dashboard-agenda"
      aria-labelledby="agenda-title"
    >
      <div className="summary-heading">
        <h2 id="agenda-title">
          {role === "admin"
            ? "Agenda dan kesiapan ujian"
            : "Agenda penyusunan soal"}
        </h2>
        <Button
          loading={loading}
          type="button"
          variant="outline"
          disabled={loading}
          onClick={refresh}
          aria-label="Perbarui agenda ujian"
        >
          {loading ? "Memuat…" : "Perbarui"}
        </Button>
      </div>
      <div role="status">
        {loading ? (
          <p>Memuat agenda…</p>
        ) : error ? (
          <p>
            Agenda belum dapat dimuat. Coba perbarui atau buka Persiapan ujian.
          </p>
        ) : null}
      </div>
      {data && summary && (
        <>
          <p className="muted summary-caption">
            {role === "admin"
              ? "Ujian nonarsip dalam organisasi."
              : "Ujian dalam cakupan penyusunan Anda. Cakupan koreksi dapat berbeda."}
          </p>
          <p className="muted summary-caption">
            Data per{" "}
            <time dateTime={data.server_now}>
              {formatAgendaTime(data.server_now)}
            </time>
            {loading || error
              ? " · Menampilkan data terakhir yang berhasil dimuat."
              : ""}
          </p>
          <dl className="cards agenda-counts">
            {[
              ["Ujian berlangsung", summary.running],
              ["Draf perlu dilengkapi", summary.incomplete],
              ["Ujian selesai", summary.finished],
            ].map(([label, count]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formatCount(Number(count))}</dd>
              </div>
            ))}
          </dl>
          {summary.visible > 0 ? (
            <>
              <p className="muted summary-caption">
                Menampilkan {summary.agenda.length} dari{" "}
                {formatCount(summary.visible)} ujian nonarsip. Prioritas:
                berlangsung, draf, lalu terjadwal.
              </p>
              <ul className="agenda-list">
                {summary.agenda.map((e) => (
                  <li key={e.id}>
                    <div>
                      <strong>{e.title}</strong>
                      <span className="muted">
                        <time dateTime={e.starts_at}>
                          {formatAgendaTime(e.starts_at)}
                        </time>{" "}
                        · {e.lifecycle}
                      </span>
                    </div>
                    <Link
                      className="summary-link"
                      aria-label={`Lihat kesiapan ${e.title}`}
                      href={`/dashboard/preparation?exam=${encodeURIComponent(e.id)}`}
                    >
                      Lihat kesiapan<span aria-hidden="true"> →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <StateCard kind="empty" className="empty-state">
              <p>
                {data.exams.length
                  ? "Semua ujian dalam cakupan Anda sudah diarsipkan."
                  : "Belum ada ujian dalam cakupan Anda."}
              </p>
              <p className="muted">
                {role === "admin"
                  ? "Buka Persiapan ujian untuk menyiapkan ujian."
                  : "Periksa penugasan kelas dan mata pelajaran bersama Admin."}
              </p>
            </StateCard>
          )}
        </>
      )}
      <div className="actions">
        <Button asChild>
          <Link href="/dashboard/preparation">Persiapan ujian</Link>
        </Button>
        <Button asChild variant="outline">
          <Link
            href={
              role === "admin" ? "/dashboard/monitor" : "/dashboard/grading"
            }
          >
            {role === "admin" ? "Pantau pelaksanaan" : "Buka koreksi"}
          </Link>
        </Button>
      </div>
    </section>
  );
}
