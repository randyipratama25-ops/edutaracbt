import {AccessDenied} from "../../../components/feedback/access-denied";
import { PageHeading } from "../../../components/layout/page-heading";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { SystemPanel } from "../../../components/system/panel";
export const metadata={title:"Audit aktivitas | EDUTARA CBT"};
export default async function Page() {
  const a = await actor();
  if(!a)redirect("/login");
  if(a.role!=="admin"||a.context!=="staff")return <AccessDenied/>;
  return (
    <>
      <PageHeading title="Audit aktivitas" description="Telusuri tindakan pengguna berdasarkan waktu dan jenis aktivitas." />
      <SystemPanel mode="audit" />
    </>
  );
}
