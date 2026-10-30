import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { AcceptancePanel } from "../../../components/acceptance/panel";
export default async function Page() {
  const a = await actor();
  if (a?.role !== "admin") redirect("/dashboard");
  return (
    <>
      <h1>Penerimaan operasional</h1>
      <AcceptancePanel />
    </>
  );
}
