import { UsersPanel } from "../../../components/admin/users-panel";
export default function Users() {
  return (
    <>
      <h1>Pengguna</h1>
      <p className="muted">Kelola identitas, status akun, dan impor peserta.</p>
      <UsersPanel />
    </>
  );
}
