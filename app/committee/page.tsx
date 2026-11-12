import { redirect } from "next/navigation";
import { ContextHelp } from "../../components/help/context-help";
import { LogoutButton } from "../../components/auth/logout-button";
import { CommitteePanel } from "../../components/operations/committee-panel";
import { actor } from "../../lib/auth/actor";

export const metadata = { title: "Ruang Panitia Ujian | EDUTARA CBT" };

export default async function CommitteePortal() {
  const a = await actor();
  if (!a || a.context !== "committee") redirect("/login");
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="workspace supervisor-workspace committee-workspace"
    >
      <header className="student-portal-heading">
        <div>
          <h1>Ruang Panitia Ujian</h1>
          <p className="muted">{a.full_name}</p>
        </div>
        <div className="actions">
          <ContextHelp audience="committee" page="/committee" />
          <LogoutButton />
        </div>
      </header>

      <CommitteePanel admin={false} />
    </main>
  );
}
