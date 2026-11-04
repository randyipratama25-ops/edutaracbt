"use client";
import { AuditPanel } from "./audit";
import { SettingsPanel } from "./settings";
import { JobsPanel } from "./jobs";
export function SystemPanel({ mode }: { mode: "settings" | "audit" | "jobs" }) {
  return mode === "settings" ? (
    <SettingsPanel />
  ) : mode === "audit" ? (
    <AuditPanel />
  ) : (
    <JobsPanel />
  );
}
