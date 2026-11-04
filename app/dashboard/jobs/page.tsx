import {AccessDenied} from "../../../components/feedback/access-denied";
import { PageHeading } from "../../../components/layout/page-heading";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { SystemPanel } from "../../../components/system/panel";
import { OperationalHealth } from "../../../components/system/health";
export default async function Page() {
  const a = await actor();
  if(!a)redirect("/login");
  if(a.role!=="admin"||a.context!=="staff")return <AccessDenied/>;
  return (
    <>
      <PageHeading title="Otomasi dan backup" description="Periksa layanan, tindak lanjuti pekerjaan, dan kelola cadangan." />
      <OperationalHealth />
      <SystemPanel mode="jobs" />
    </>
  );
}
