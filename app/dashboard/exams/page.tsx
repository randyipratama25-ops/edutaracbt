import { PageHeading } from "../../../components/layout/page-heading";
import { AuthoringPanel } from "../../../components/authoring/panel";
export default function ExamsPage() {
  return (
    <>
      <PageHeading title="Ujian dan bank soal" description="Atur jadwal, susun soal, dan pantau target penyusunan." />
      <AuthoringPanel />
    </>
  );
}
