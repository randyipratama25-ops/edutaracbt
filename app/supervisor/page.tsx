import { ReviewPanel } from "../../components/attempts/review";
import { redirect } from "next/navigation";
import { actor } from "../../lib/auth/actor";
import { LogoutButton } from "../../components/auth/logout-button";
export const dynamic = "force-dynamic";
export default async function Supervisor() {
  const a = await actor();
  if (!a || a.context !== "supervisor") redirect("/login");
  return (
    <main className="workspace">
      <p className="eyebrow">PENGAWAS UJIAN</p>
      <h1>Selamat datang, {a.full_name}</h1>
      <ReviewPanel />
      <LogoutButton />
    </main>
  );
}
