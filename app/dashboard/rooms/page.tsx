import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { OperationsPanel } from "../../../components/operations/panel";
export default async function Rooms() {
  const a = await actor();
  if (a?.role !== "admin") redirect("/dashboard");
  return (
    <>
      <h1>Ruang, sesi dan pengawas</h1>
      <OperationsPanel mode="rooms" />
    </>
  );
}
