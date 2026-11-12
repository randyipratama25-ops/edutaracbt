import { PageHeading } from "../../../components/layout/page-heading";
import { MasterPanel } from "../../../components/admin/master-panel";
export const metadata = { title: "Data master | EDUTARA CBT" };
export default function Master() {
  return (
    <>
      <PageHeading
        title="Data master"
      />
      <MasterPanel />
    </>
  );
}
