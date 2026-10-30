import { actor } from "../../lib/auth/actor";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "../../components/ui/button";
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
        <h2>Kelola kegiatan ujian</h2>
        <p>
          Akses data akademik dan penyusunan ujian dari satu ruang kerja.
        </p>
        <div className="actions">
          <Button asChild><Link href="/dashboard/exams">Ujian & bank soal</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/master-data">Data akademik</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/users">Pengguna</Link></Button>
        </div>
      </section>
    </>
  );
}
