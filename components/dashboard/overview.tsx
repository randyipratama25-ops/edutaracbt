import { RoleActions } from "./role-actions";
import { GradingPriority } from "./grading-priority";
import { PageHeading } from "../layout/page-heading";
import { Workbench } from "../workflow/workbench";
import { formatCount } from "../../lib/dashboard/summary";
import type { SummaryCount } from "../../lib/dashboard/counts";
import { RefreshSummary } from "./refresh-summary";
export function DashboardOverview({
  role,
  counts = [],
}: {
  role: "admin" | "teacher";
  counts?: SummaryCount[];
}) {
  return (
    <div className="dashboard-overview stack">
      <PageHeading
        title="Ringkasan madrasah"
        description={
          role === "admin"
            ? "Kesiapan ujian dan layanan madrasah."
            : "Soal, koreksi dan hasil sesuai penugasan Anda."
        }
      />
      <RoleActions role={role} />
      {role === "admin" ? (
        <section
          aria-labelledby="organization-summary-title"
          className="organization-summary"
        >
          <div className="summary-heading">
            <h2 id="organization-summary-title">Data madrasah</h2>
            <RefreshSummary />
          </div>
          <p className="muted summary-caption">
            Total data dalam organisasi, termasuk data nonaktif.
          </p>
          <div className="cards summary-counts">
            {counts.map(({ label, count }) => (
              <section className="panel" key={label}>
                <h3>{label}</h3>
                <strong className="metric">
                  {count === null ? "—" : formatCount(count)}
                </strong>
                {count === null && (
                  <p role="status">
                    Data belum dapat dimuat. Perbarui untuk mencoba lagi.
                  </p>
                )}
              </section>
            ))}
          </div>
        </section>
      ) : (
        <GradingPriority />
      )}
      <Workbench role={role} />
    </div>
  );
}
