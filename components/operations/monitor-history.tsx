import { IntegrityReview } from "./integrity-review";
import { monitorHistorySchema } from "../../lib/operations/contracts";
import { StateCard } from "../feedback/state";
const labels: Record<string, string> = {
  reset: "Reset percobaan",
  unlock: "Buka kunci",
  disqualify: "Diskualifikasi",
  extend: "Dispensasi waktu",
};
const time = (value: string) =>
  new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) +
  " WIB";
export function MonitorHistory({
  value,
  attempt,
  active,
  canOperate,
}: {
  value: unknown;
  attempt: string;
  active: boolean;
  canOperate: boolean;
}) {
  const parsed = monitorHistorySchema.safeParse(value);
  if (!parsed.success)
    return (
      <StateCard
        kind="error"
        description="Riwayat belum tersedia. Tutup lalu buka kembali riwayat peserta."
      />
    );
  const { overrides } = parsed.data;
  return (
    <div className="monitor-history stack">
      <IntegrityReview key={attempt} attempt={attempt} active={active} canOperate={canOperate} />
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
