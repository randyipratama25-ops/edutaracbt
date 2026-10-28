import { MasterPanel } from "../../../components/admin/master-panel";
export default function Master() {
  return (
    <>
      <h1>Data master</h1>
      <p className="muted">
        Kelas, mata pelajaran, dan penugasan menggunakan identitas yang pasti.
      </p>
      <MasterPanel />
    </>
  );
}
