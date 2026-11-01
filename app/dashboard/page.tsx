import { RoleActions } from "../../components/dashboard/role-actions";
import { GradingPriority } from "../../components/dashboard/grading-priority";
import { PageHeading } from "../../components/layout/page-heading";
import { Workbench } from "../../components/workflow/workbench";
import { actor } from "../../lib/auth/actor";
import { redirect } from "next/navigation";
export default async function Dashboard() {
  const a = await actor();
  if (!a) redirect("/login");
  const admin = a.role === "admin";
  const results = admin ? await Promise.all(
    ["profiles", "classes", "subjects"].map((t) =>
      a.client.from(t).select("id", { head: true, count: "exact" }),
    ),
  ) : [];
  return (
    <>
      <PageHeading title={admin ? "Dashboard Admin" : "Dashboard Guru"} description={admin ? "Kesiapan ujian dan layanan madrasah." : "Persiapan soal, koreksi dan hasil dalam penugasan Anda."} />
      <RoleActions role={admin ? "admin" : "teacher"} />
      {!admin && <GradingPriority />}
      {admin && <div className="cards">
        {results.map((r, i) => (
          <section className="panel" key={i}>
            <h2>{["Pengguna", "Kelas", "Mata pelajaran"][i]}</h2>
            <strong className="metric">{r.error ? "—" : (r.count ?? 0)}</strong>
            {r.error ? <p>Data belum dapat dimuat.</p> : null}
          </section>
        ))}
      </div>}
      <Workbench role={admin ? "admin" : "teacher"} />
    </>
  );
}
