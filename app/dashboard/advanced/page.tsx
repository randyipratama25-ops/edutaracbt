import { PageHeading } from "../../../components/layout/page-heading";
import { AISettings } from "../../../components/ai/settings";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { AdvancedPanel } from "../../../components/advanced/panel";
export default async function Page() {
  const a = await actor();
  if (a?.role !== "admin") redirect("/dashboard");
  return (
    <>
      <PageHeading title="Fitur lanjutan" />
      <AISettings />
      <AdvancedPanel />
    </>
  );
}
