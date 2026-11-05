import { AccessDenied } from "../../../components/feedback/access-denied";
import { PageHeading } from "../../../components/layout/page-heading";
import { AISettings } from "../../../components/ai/settings";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { AdvancedPanel } from "../../../components/advanced/panel";
export default async function Page() {
  const a = await actor();
  if (!a) redirect("/login");
  if (a.role !== "admin" || a.context !== "staff") return <AccessDenied />;
  return (
    <>
      <PageHeading
        title="Fitur lanjutan"
        description="Kelola penyedia AI, pertukaran nilai, dan evaluasi perangkat."
      />
      <div className="advanced-workspace stack">
        <AISettings />
        <AdvancedPanel />
      </div>
    </>
  );
}
