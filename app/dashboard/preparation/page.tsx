import { PageHeading } from "../../../components/layout/page-heading";
import { PreparationPanel } from "../../../components/workflow/preparation";
export const metadata = { title: "Persiapan ujian | EDUTARA CBT" };
export default function PreparationPage() {
  return (
    <>
      <PageHeading
        title="Persiapan ujian"
      />
      <PreparationPanel />
    </>
  );
}
