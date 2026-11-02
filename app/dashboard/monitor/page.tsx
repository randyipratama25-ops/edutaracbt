import { PageHeading } from "../../../components/layout/page-heading";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { OperationsPanel } from "../../../components/operations/panel";
export const metadata={title:"Peninjauan ujian | EDUTARA CBT"};
export const dynamic = "force-dynamic";
export default async function Monitor() {
  const a = await actor();
  if (!a || !["admin", "teacher"].includes(a.role) || a.context !== "staff")
    redirect("/dashboard");
  return (
    <>
      <PageHeading title="Peninjauan ujian" description="Pilih ujian, pantau peserta, lalu tindak lanjuti kendala." />
      <OperationsPanel />
    </>
  );
}
