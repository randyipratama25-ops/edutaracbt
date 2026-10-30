import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { AdvancedPanel } from "../../../components/advanced/panel";
export default async function Page() {
  const a = await actor();
  if (a?.role !== "admin") redirect("/dashboard");
  return (
    <>
      <h1>Fitur lanjutan</h1>
      <AdvancedPanel />
    </>
  );
}
