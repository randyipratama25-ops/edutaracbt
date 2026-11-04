import { monitorHistorySchema } from "../../lib/operations/contracts";
import { StateCard } from "../feedback/state";
const labels: Record<string, string> = {
  visibility_hidden: "Halaman ujian ditinggalkan",
  focus_loss: "Jendela kehilangan fokus",
  fullscreen_exit: "Keluar dari layar penuh",
  shortcut: "Pintasan keyboard",
  pagehide: "Halaman ditutup atau dinavigasi",
  cut: "Memotong teks",
  visibility: "Perubahan visibilitas",
  blur: "Jendela kehilangan fokus",
  fullscreen: "Perubahan layar penuh",
  offline: "Koneksi terputus",
  reset: "Reset percobaan",
  unlock: "Buka kunci",
  disqualify: "Diskualifikasi",
  extend: "Dispensasi waktu",
  copy: "Menyalin",
  paste: "Menempel",
  contextmenu: "Menu konteks",
};
const time = (value: string) =>
  new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) +
  " WIB";
export function MonitorHistory({ value }: { value: unknown }) {
  const parsed = monitorHistorySchema.safeParse(value);
  if (!parsed.success)
    return (
      <StateCard
        kind="error"
        description="Riwayat belum tersedia. Tutup lalu buka kembali riwayat peserta."
      />
    );
  const { events, overrides } = parsed.data;
  return (
    <div className="monitor-history stack">
      <section aria-label="Kejadian peserta">
        <h3>Kejadian peserta · {events.length}</h3>
        {!events.length && <p>Belum ada kejadian tercatat.</p>}
        <ol className="monitor-timeline">
          {events.map((event, index) => (
            <li key={index}>
              <strong>{labels[event.kind] || event.kind}</strong>
              <time dateTime={event.created_at}>{time(event.created_at)}</time>
              <p>
                {event.countable
                  ? "Masuk perhitungan insiden"
                  : "Catatan informasi"}
              </p>
              {event.metadata != null && (
                <details>
                  <summary>Rincian kejadian</summary>
                  <pre className="answer-text">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      </section>
      <section aria-label="Tindakan petugas">
        <h3>Tindakan petugas · {overrides.length}</h3>
        {!overrides.length && <p>Belum ada tindakan petugas.</p>}
        <ol className="monitor-timeline">
          {overrides.map((item) => (
            <li key={item.id}>
              <strong>{labels[item.action] || item.action}</strong>
              <time dateTime={item.created_at}>{time(item.created_at)}</time>
              <p className="answer-text">{item.reason}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
