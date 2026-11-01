import { PageHeading } from "../../../components/layout/page-heading";
import { UsersPanel } from "../../../components/admin/users-panel";
export default function Users() {
  return (
    <>
      <PageHeading title="Pengguna" description="Kelola identitas, status akun, dan impor peserta." />
      <UsersPanel />
    </>
  );
}
