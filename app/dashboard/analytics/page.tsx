import { PageHeading } from "../../../components/layout/page-heading";
import { ResultsPanel } from "../../../components/results/panel";
export default function Analytics() {
  return (
    <>
      <PageHeading title="Analitik dan laporan" description="Analisis hanya memakai peserta layak dengan nilai final dan versi soal yang sama." />
      <ResultsPanel analyticsFirst />
    </>
  );
}
