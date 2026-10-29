import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { SystemPanel } from "../../../components/system/panel";
export default async function Page() {
  const a = await actor();
  if (a?.role !== "admin") redirect("/dashboard");
  return (
    <>
      <h1>Audit aktivitas</h1>
      <SystemPanel mode="audit" />
    </>
  );
}
