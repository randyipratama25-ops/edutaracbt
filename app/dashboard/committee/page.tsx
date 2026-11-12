import { redirect } from "next/navigation";
import { CommitteePanel } from "../../../components/operations/committee-panel";
import { AccessDenied } from "../../../components/feedback/access-denied";
import { PageHeading } from "../../../components/layout/page-heading";
import { actor } from "../../../lib/auth/actor";

export const metadata = { title: "Penugasan Panitia Ujian | EDUTARA CBT" };

export default async function CommitteeAdministration() {
  const a = await actor();
  if (!a) redirect("/login");
  if (a.role !== "admin" || a.context !== "staff") return <AccessDenied />;
  return (
    <>
      <PageHeading
        title="Panitia Ujian"
      />
      <CommitteePanel admin />
    </>
  );
}
