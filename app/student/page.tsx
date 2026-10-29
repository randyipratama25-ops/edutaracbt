import { Inbox } from "../../components/operations/inbox";
import { redirect } from "next/navigation";
import { actor } from "../../lib/auth/actor";
import { StudentPortal } from "../../components/attempts/player";
export const dynamic = "force-dynamic";
export default async function Student() {
  const a = await actor();
  if (!a || a.context !== "student") redirect("/login");
  return (
    <>
      <Inbox />
      <StudentPortal />
    </>
  );
}
