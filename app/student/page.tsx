import { Inbox } from "../../components/operations/inbox";
import { redirect } from "next/navigation";
import { actor } from "../../lib/auth/actor";
import { StudentPortal } from "../../components/attempts/player";
export const metadata = { title: "Ujian saya | EDUTARA CBT" };
export const dynamic = "force-dynamic";
export default async function Student() {
  const a = await actor();
  if (!a || a.context !== "student" || a.role !== "student") redirect("/login");
  return (
    <>
      <div className="student-inbox">
        <Inbox />
      </div>
      <StudentPortal studentId={a.id} />
    </>
  );
}
