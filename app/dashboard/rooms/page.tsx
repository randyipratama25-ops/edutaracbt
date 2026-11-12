import {AccessDenied} from "../../../components/feedback/access-denied";
export const metadata = { title: "Ruang, sesi dan pengawas | EDUTARA CBT" };
import { PageHeading } from "../../../components/layout/page-heading";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { OperationsPanel } from "../../../components/operations/panel";
export default async function Rooms() {
  const a = await actor();
  if(!a)redirect("/login");
  if(a.role!=="admin"||a.context!=="staff")return <AccessDenied/>;
  return (
    <>
      <PageHeading title="Ruang, sesi dan pengawas" />
      <OperationsPanel mode="rooms" />
    </>
  );
}
