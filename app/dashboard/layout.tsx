import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { actor } from "../../lib/auth/actor";
import { DashboardShell } from "../../components/layout/dashboard-shell";
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
  return <DashboardShell name={a.full_name} role={a.role === "admin" ? "admin" : "teacher"}>{children}</DashboardShell>;
}
