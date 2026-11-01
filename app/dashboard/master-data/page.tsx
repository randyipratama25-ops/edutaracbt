import { PageHeading } from "../../../components/layout/page-heading";
import { MasterPanel } from "../../../components/admin/master-panel";
export default function Master() {
  return (
    <>
      <PageHeading title="Data master" description="Kelas, mata pelajaran, dan penugasan menggunakan identitas yang pasti." />
      <MasterPanel />
    </>
  );
}
