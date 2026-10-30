"use client";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { AdvancedPanel } from "../../components/advanced/panel";
export default function Fixture() {
  return (
    <DashboardShell role="admin" name="Petugas Pengujian">
      <h1>Fitur lanjutan</h1>
      <AdvancedPanel />
    </DashboardShell>
  );
}
