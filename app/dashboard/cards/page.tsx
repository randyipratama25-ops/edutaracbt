export const metadata = { title: "Kartu peserta ujian | EDUTARA CBT" };
import { PageHeading } from "../../../components/layout/page-heading";
import { CardsPanel } from "../../../components/operations/cards";
export default function Cards() {
  return (
    <>
      <PageHeading title="Kartu peserta ujian" />
      <CardsPanel />
    </>
  );
}
