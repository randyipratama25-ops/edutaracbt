import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { OperationsPanel } from "../../../components/operations/panel";
export const dynamic = "force-dynamic";
export default async function Monitor() {
  const a = await actor();
  if (!a || !["admin", "teacher"].includes(a.role) || a.context !== "staff")
    redirect("/dashboard");
  return (
    <>
      <h1>Peninjauan ujian</h1>
      <OperationsPanel />
    </>
  );
}
