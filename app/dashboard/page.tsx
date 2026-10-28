import { actor } from "../../lib/auth/actor";
import { redirect } from "next/navigation";
import Link from "next/link";
export default async function Dashboard() {
  const a = await actor();
  if (!a) redirect("/login");
  const results = await Promise.all(
    ["profiles", "classes", "subjects"].map((t) =>
      a.client.from(t).select("id", { head: true, count: "exact" }),
    ),
  );
  return (
    <>
      <p className="eyebrow">RUANG PENGELOLAAN</p>
      <h1>Ringkasan madrasah</h1>
      <p className="muted">Statistik sesuai cakupan akses akun Anda.</p>
      <div className="cards">
        {results.map((r, i) => (
          <section className="panel" key={i}>
            <h2>{["Pengguna", "Kelas", "Mata pelajaran"][i]}</h2>
            <strong className="metric">{r.error ? "—" : (r.count ?? 0)}</strong>
            {r.error ? <p>Data belum dapat dimuat.</p> : null}
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>Mulai dari data yang rapi</h2>
        <p>
          Kelola akun, kelas, mata pelajaran, dan penugasan guru sebelum
          menyusun ujian.
        </p>
        <div className="actions">
          <Link href="/dashboard/users">Kelola pengguna →</Link>
          <Link href="/dashboard/master-data">Kelola data master →</Link>
        </div>
      </section>
    </>
  );
}
