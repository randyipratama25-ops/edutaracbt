import { StateCard } from "../components/feedback/state";
export default function Loading() {
  return (
    <main id="main-content" tabIndex={-1} className="workspace">
      <StateCard
        kind="loading"
        title="Menyiapkan halaman"
        description="Mohon tunggu sementara halaman dimuat."
      />
    </main>
  );
}
