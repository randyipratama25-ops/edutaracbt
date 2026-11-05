import { StartHere } from "../../components/help/start-here";
import { ContextHelp } from "../../components/help/context-help";
import { RoleActions } from "../../components/dashboard/role-actions";
import { SupervisorCards } from "../../components/operations/supervisor-cards";
import { OperationsPanel } from "../../components/operations/panel";
import { redirect } from "next/navigation";
import { actor } from "../../lib/auth/actor";
import { LogoutButton } from "../../components/auth/logout-button";
export const metadata = { title: "Ruang pengawasan | EDUTARA CBT" };
export const dynamic = "force-dynamic";
export default async function Supervisor() {
  const a = await actor();
  if (
    !a ||
    a.context !== "supervisor" ||
    !["supervisor", "teacher"].includes(a.role)
  )
    redirect("/login");
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="workspace supervisor-workspace"
    >
      <header className="student-portal-heading">
        <div>
          <h1>Ruang pengawasan</h1>
          <p className="muted">{a.full_name}</p>
        </div>
        <div className="actions">
          <ContextHelp audience="supervisor" page="/supervisor" />
          <LogoutButton />
        </div>
      </header>
      <StartHere page="/supervisor" />
      <RoleActions role="supervisor" />
      <section id="pelaksanaan" aria-label="Pelaksanaan ujian">
        <OperationsPanel />
      </section>
      <SupervisorCards />
    </main>
  );
}
