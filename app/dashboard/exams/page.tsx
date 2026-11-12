import { PageHeading } from "../../../components/layout/page-heading";
import { AuthoringPanel } from "../../../components/authoring/panel";
export const metadata = {title:"Ujian dan bank soal | EDUTARA CBT"};
export default function ExamsPage() {
  return (
    <>
      <PageHeading title="Ujian dan bank soal" />
      <AuthoringPanel />
    </>
  );
}
