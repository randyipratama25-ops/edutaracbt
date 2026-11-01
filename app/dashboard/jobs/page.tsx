import { PageHeading } from "../../../components/layout/page-heading";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { SystemPanel } from "../../../components/system/panel";
import { OperationalHealth } from "../../../components/system/health";
export default async function Page() {
  const a = await actor();
  if (a?.role !== "admin") redirect("/dashboard");
  return (
    <>
      <PageHeading title="Otomasi dan backup" />
      <OperationalHealth />
      <SystemPanel mode="jobs" />
    </>
  );
}
