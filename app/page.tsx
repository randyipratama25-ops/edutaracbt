import Link from "next/link";
import { Button } from "../components/ui/button";
export default function Home() {
  return (
    <main className="auth-wrap">
      <section className="panel hero">
        <p className="eyebrow">EDUTARA CBT</p>
        <h1>
          Ujian yang terstruktur.
          <br />
          Pengelolaan yang terarah.
        </h1>
        <p>Fondasi pengelolaan pengguna dan data akademik madrasah.</p>
        <p className="notice">
          Aplikasi dalam pengembangan. Pelaksanaan ujian belum dibuka.
        </p>
        <Button asChild>
          <Link href="/login">Masuk ke aplikasi</Link>
        </Button>
      </section>
    </main>
  );
}
