import { CardsPanel } from "../../components/operations/cards";
import { OperationsPanel } from "../../components/operations/panel";
import { redirect } from "next/navigation";
import { actor } from "../../lib/auth/actor";
import { LogoutButton } from "../../components/auth/logout-button";
export const dynamic = "force-dynamic";
export default async function Supervisor() {
  const a = await actor();
  if (!a || a.context !== "supervisor") redirect("/login");
  return (
    <main id="main-content" tabIndex={-1} className="workspace supervisor-workspace">
      <header className="student-portal-heading"><div><p className="eyebrow">PENGAWAS UJIAN</p><h1>Ruang pengawasan</h1><p className="muted">{a.full_name}</p></div><LogoutButton /></header>
      <OperationsPanel />
      <details>
        <summary>Kartu peserta</summary>
        <CardsPanel />
      </details>
    </main>
  );
}
