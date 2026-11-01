import { PageHeading } from "../../../components/layout/page-heading";
import { PreparationPanel } from "../../../components/workflow/preparation";
export default function PreparationPage() {
  return (
    <>
      <PageHeading title="Persiapan ujian" description="Susun draf, periksa kesiapan, lalu publikasikan jadwal kepada siswa." />
      <PreparationPanel />
    </>
  );
}
