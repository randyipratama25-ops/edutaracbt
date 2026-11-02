import { PageHeading } from "../../../components/layout/page-heading";
import { ResultsPanel } from "../../../components/results/panel";
export const metadata={title:"Analitik dan laporan | EDUTARA CBT"};
export default function Analytics() {
  return (
    <>
      <PageHeading title="Analitik dan laporan" description="Pilih ujian dan peserta, tinjau analisis, lalu unduh laporan." />
      <ResultsPanel analyticsFirst />
    </>
  );
}
