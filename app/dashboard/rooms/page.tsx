export const metadata = { title: "Ruang, sesi dan pengawas | EDUTARA CBT" };
import { PageHeading } from "../../../components/layout/page-heading";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { OperationsPanel } from "../../../components/operations/panel";
export default async function Rooms() {
  const a = await actor();
  if (a?.role !== "admin" || a.context !== "staff") redirect("/dashboard");
  return (
    <>
      <PageHeading title="Ruang, sesi dan pengawas" description="Siapkan ruang dan sesi, tempatkan peserta, lalu tugaskan pengawas." />
      <OperationsPanel mode="rooms" />
    </>
  );
}
