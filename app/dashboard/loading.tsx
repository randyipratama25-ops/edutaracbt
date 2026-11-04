import { StateCard } from "../../components/feedback/state";
export default function Loading() {
  return (
    <section
      className="page-loading"
      aria-busy="true"
      aria-label="Memuat halaman"
    >
      <StateCard
        kind="loading"
        title="Menyiapkan ruang kerja"
        description="Memuat halaman dan informasi yang Anda perlukan."
      />
      <div className="cards" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <div key={n} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="skeleton skeleton-table" aria-hidden="true" />
    </section>
  );
}
