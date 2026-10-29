import { ResultsPanel } from "../../../components/results/panel";
export default function Analytics() {
  return (
    <>
      <h1>Analitik dan laporan</h1>
      <p>
        Analisis hanya memakai peserta layak dengan nilai final dan versi soal
        yang sama.
      </p>
      <ResultsPanel analyticsFirst />
    </>
  );
}
