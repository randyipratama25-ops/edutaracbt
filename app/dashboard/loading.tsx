export default function Loading() {
  return <section className="page-loading" aria-busy="true" aria-label="Memuat halaman">
    <p role="status" className="muted">Menyiapkan ruang kerja…</p>
    <div className="skeleton skeleton-title" /><div className="cards">{[1,2,3].map(n => <div key={n} className="skeleton skeleton-card" />)}</div>
    <div className="skeleton skeleton-table" />
  </section>;
}
