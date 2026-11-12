import {AccessDenied} from "../../../components/feedback/access-denied";
export const metadata = { title: "Pengaturan aplikasi | EDUTARA CBT" };
import { PageHeading } from "../../../components/layout/page-heading";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { SystemPanel } from "../../../components/system/panel";
export default async function Page() {
  const a = await actor();
  if(!a)redirect("/login");
  if(a.role!=="admin"||a.context!=="staff")return <AccessDenied/>;
  return (
    <>
      <PageHeading title="Pengaturan aplikasi" />
      <SystemPanel mode="settings" />
    </>
  );
}
