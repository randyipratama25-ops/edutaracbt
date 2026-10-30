import { PreparationPanel } from "../../../components/workflow/preparation";
export default function PreparationPage() {
  return (
    <>
      <p className="eyebrow">ALUR UJIAN</p>
      <h1>Persiapan ujian</h1>
      <p className="muted">
        Susun draf, periksa kesiapan, lalu publikasikan jadwal kepada siswa.
      </p>
      <PreparationPanel />
    </>
  );
}
