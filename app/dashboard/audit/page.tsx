import { PageHeading } from "../../../components/layout/page-heading";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { SystemPanel } from "../../../components/system/panel";
export default async function Page() {
  const a = await actor();
  if (a?.role !== "admin") redirect("/dashboard");
  return (
    <>
      <PageHeading title="Audit aktivitas" description="Telusuri tindakan pengguna berdasarkan waktu dan jenis aktivitas." />
      <SystemPanel mode="audit" />
    </>
  );
}
