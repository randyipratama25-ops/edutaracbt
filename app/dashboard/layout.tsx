import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { actor } from "../../lib/auth/actor";
import { LogoutButton } from "../../components/auth/logout-button";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const a = await actor();
  if (!a) redirect("/login");
  if (a.context !== "staff")
    redirect(a.context === "supervisor" ? "/supervisor" : "/student");
  return (
    <div className="app-shell">
      <aside>
        <Link className="brand" href="/dashboard">
          EDUTARA CBT
        </Link>
        <nav aria-label="Navigasi utama">
          <Link href="/dashboard">Ringkasan</Link>
          <Link href="/dashboard/users">Pengguna</Link>
          <Link href="/dashboard/master-data">Data master</Link>
          <Link href="/dashboard/exams">Ujian dan soal</Link>
          <Link href="/dashboard/results">Hasil dan koreksi</Link>
          <Link href="/dashboard/analytics">Analitik dan laporan</Link>
          {a.role === "admin" && (
            <Link href="/dashboard/monitor">Peninjauan ujian</Link>
          )}
        </nav>
        <p className="muted">
          {a.full_name}
          <br />
          {a.role === "admin" ? "Admin" : "Guru"}
        </p>
        <LogoutButton />
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
