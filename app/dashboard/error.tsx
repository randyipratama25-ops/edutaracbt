"use client";
import { Button } from "../../components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>Halaman belum dapat dimuat</h1>
      <p>Periksa koneksi dan coba kembali.</p>
      <Button onClick={reset}>Coba lagi</Button>
    </section>
  );
}
