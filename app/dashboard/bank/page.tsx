import { PageHeading } from "../../../components/layout/page-heading";
import { BankPanel } from "../../../components/bank/panel";
export const metadata = { title: "Bank soal | EDUTARA CBT" };
export default function BankPage() {
  return (
    <>
      <PageHeading
        title="Bank soal"
      />
      <BankPanel />
    </>
  );
}
