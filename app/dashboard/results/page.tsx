import { PageHeading } from "../../../components/layout/page-heading";
import { ResultsPanel } from "../../../components/results/panel";
export const metadata={title:"Hasil dan koreksi | EDUTARA CBT"};
export default function Results() {
  return (
    <>
      <PageHeading title="Hasil dan koreksi" description="Nilai, persetujuan koreksi, dan laporan sesuai cakupan kelas–mapel." />
      <ResultsPanel />
    </>
  );
}
