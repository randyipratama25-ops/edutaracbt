import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { ReviewPanel } from "../../../components/attempts/review";
export const dynamic = "force-dynamic";
export default async function Monitor() {
  const a = await actor();
  if (!a || a.role !== "admin" || a.context !== "staff") redirect("/dashboard");
  return (
    <>
      <h1>Peninjauan ujian</h1>
      <ReviewPanel />
    </>
  );
}
