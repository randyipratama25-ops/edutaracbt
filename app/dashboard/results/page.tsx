import { PageHeading } from "../../../components/layout/page-heading";
import { ResultsPanel } from "../../../components/results/panel";
export default function Results() {
  return (
    <>
      <PageHeading title="Hasil dan koreksi" description="Nilai, persetujuan koreksi, dan laporan sesuai cakupan kelas–mapel." />
      <ResultsPanel />
    </>
  );
}
