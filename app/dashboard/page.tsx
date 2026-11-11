import { DashboardOverview } from "../../components/dashboard/overview";
import { actor } from "../../lib/auth/actor";
import { loadDashboardCounts } from "../../lib/dashboard/counts";
import { loginDestination } from "../../lib/auth/account-request";
import { redirect } from "next/navigation";
export const metadata = { title: "Ringkasan madrasah | EDUTARA CBT" };
export default async function Dashboard() {
  const a = await actor();
  if (!a) redirect("/login");
  // Page and layout can render in parallel; guard before loading any summary data.
  if (a.context !== "staff")
    redirect(loginDestination(a.context));
  if (a.role !== "admin" && a.role !== "teacher") redirect("/login");
  const counts = await loadDashboardCounts(a);
  return <DashboardOverview role={a.role} counts={counts} />;
}
