"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { PreparationPanel } from "../../components/workflow/preparation";
import { IncidentPanel } from "../../components/workflow/incidents";
import { StudentHelp } from "../../components/workflow/help";
import { UsersPanel } from "../../components/admin/users-panel";
const aid = "03000000-0000-4000-8000-000000000003";
export default function Stage3Fixture() {
  const [mode, setMode] = useState("preparation"),
    [teacher, setTeacher] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setMode(q.get("mode") || "preparation");
    setTeacher(q.get("role") === "teacher");
  }, []);
  return (
    <div data-mode={mode}>
      <DashboardShell role={teacher ? "teacher" : "admin"} name="Petugas Uji">
        <h1>
          {mode === "preparation"
            ? "Persiapan ujian"
            : mode === "incidents"
              ? "Pelaksanaan"
              : "Uji alur"}
        </h1>
        {mode === "preparation" ? (
          <PreparationPanel />
        ) : mode === "incidents" ? (
          <IncidentPanel
            exam="03000000-0000-4000-8000-000000000001"
            admin={!teacher}
            rows={[
              {
                student_id: "siswa-uji",
                student: "Siswa Pengujian",
                attempt_id: aid,
                version: 1,
                status: "in_progress",
                logged_in: true,
                can_act: true,
              },
              {
                student_id: "belum",
                student: "Belum Masuk",
                attempt_id: null,
                version: 0,
                status: "not_started",
                logged_in: false,
                can_act: true,
              },
            ]}
            onChanged={async () => {}}
          />
        ) : mode === "users" ? (
          <UsersPanel />
        ) : (
          <StudentHelp attemptId={aid} />
        )}
      </DashboardShell>
    </div>
  );
}
