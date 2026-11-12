import { TaskTabs } from "../../../components/ui/task-tabs";
import { AccessDenied } from "../../../components/feedback/access-denied";
import { PageHeading } from "../../../components/layout/page-heading";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { JobsPanel } from "../../../components/system/jobs";
import { OperationalHealth } from "../../../components/system/health";
export const metadata = { title: "Otomasi dan backup | EDUTARA CBT" };
export default async function Page() {
  const a = await actor();
  if (!a) redirect("/login");
  if (a.role !== "admin" || a.context !== "staff") return <AccessDenied />;
  return (
    <>
      <PageHeading
        title="Otomasi dan backup"
      />
      <TaskTabs label="Otomasi dan cadangan" items={[
        { id: "health", label: "Kondisi layanan", content: <OperationalHealth /> },
        { id: "jobs", label: "Pekerjaan dan backup", content: <JobsPanel /> },
      ]} />
    </>
  );
}
