import Link from "next/link";
export default function Student() {
  return (
    <main className="auth-wrap">
      <section className="panel">
        <h1>Ujian belum dibuka</h1>
        <p>
          Layanan PIN dan pengerjaan ujian akan tersedia setelah mesin ujian
          selesai diverifikasi.
        </p>
        <Link href="/login">Kembali ke login</Link>
      </section>
    </main>
  );
}
