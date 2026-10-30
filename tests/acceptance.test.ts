import { describe, it, expect, vi } from "vitest";
import { technicalChecks, type Snapshot } from "../lib/acceptance/readiness";
import { evaluateSlo } from "../lib/acceptance/slo.mjs";
import { evaluateRelease } from "../scripts/release/gate.mjs";
const now = Date.parse("2026-10-30T06:00:00Z");
const snapshot = (): Snapshot => ({
  observed_at: new Date(now).toISOString(),
  operational_accepted: false,
  active_attempts: 0,
  automation_enabled: true,
  reminders_enabled: true,
  retention_days: 180,
  smtp_configured: true,
  worker_approved: true,
  schedulers: [
    { name: "edutara-operations", active: true, schedule: "* * * * *" },
    {
      name: "edutara-recovery-retention",
      active: true,
      schedule: "*/15 * * * *",
    },
    {
      name: "edutara-results-publication",
      active: true,
      schedule: "* * * * *",
    },
  ],
  job_issues: 0,
  stalled_jobs: 0,
  pending_moderations: 0,
  blocked_publications: 0,
  backup: {
    id: "backup",
    completed_at: new Date(now).toISOString(),
    checksum: "a".repeat(64),
    parts: 2,
    captured_after_coverage_fix: true,
  },
});
const load = () => ({
  target_scope: "ISOLATED_STAGING",
  profile: "burst-login-http",
  logical_clients: 150,
  completed: 150,
  requests: 1500,
  errors: 0,
  semantic_errors: 0,
  answer_mismatches: 0,
  metrics: {
    login: { count: 150, p95_ms: 1000 },
    autosave: { count: 450, p95_ms: 500 },
    submit: { count: 150, p95_ms: 1000 },
  },
});
describe("operational evidence is fail closed", () => {
  it("technical passing checks never mark acceptance", () => {
    const s = snapshot();
    expect(technicalChecks(s, now).every((c) => c.passed)).toBe(true);
    expect(s.operational_accepted).toBe(false);
  });
  it("expires technical snapshots and rejects an old-coverage backup", () => {
    const s = snapshot();
    s.backup!.captured_after_coverage_fix = false;
    const c = technicalChecks(s, now + 300001);
    expect(c[0].passed).toBe(false);
    expect(c[6].passed).toBe(false);
  });
  it("rejects inactive or missing purpose-specific schedulers", () => {
    const s = snapshot();
    s.schedulers[2].active = false;
    expect(technicalChecks(s, now)[2].passed).toBe(false);
    s.schedulers[2] = { ...s.schedulers[0] };
    expect(technicalChecks(s, now)[2].passed).toBe(false);
  });
  it("flags active sessions, uncertain work and pending moderation", () => {
    const s = snapshot();
    s.active_attempts = 1;
    s.job_issues = 1;
    s.pending_moderations = 1;
    const c = technicalChecks(s, now);
    expect(c[1].passed).toBe(false);
    expect(c[4].passed).toBe(false);
    expect(c[5].passed).toBe(false);
  });
  it("does not accept a 30-client survivor sample as capacity150", () => {
    const r = load();
    r.completed = 30;
    r.errors = 120;
    r.metrics.login.count = 30;
    expect(evaluateSlo(r).passed).toBe(false);
  });
  it("requires sufficient latency samples and reports no empty latency as success", () => {
    const r = load();
    expect(evaluateSlo(r).passed).toBe(true);
    r.metrics.autosave = { count: 0, p95_ms: 0 };
    expect(evaluateSlo(r).passed).toBe(false);
  });
  it("rejects answer mismatches, semantic errors and slow submit", () => {
    for (const patch of [
      { answer_mismatches: 1 },
      { semantic_errors: 1 },
      { metrics: { ...load().metrics, submit: { count: 150, p95_ms: 3001 } } },
    ])
      expect(evaluateSlo({ ...load(), ...patch }).passed).toBe(false);
  });
  it("refuses historical v1 manifests instead of assuming all three cron jobs exist", () => {
    expect(evaluateRelease({ format: "edutara-release-v1" }).ready).toBe(false);
  });
});
const staff = vi.fn();
vi.mock("../lib/results/server", () => ({ staff: () => staff() }));
import { GET } from "../app/api/acceptance/route";
describe("acceptance API authorization", () => {
  it("denies a Teacher before reading any SQL", async () => {
    const rpc = vi.fn();
    staff.mockResolvedValue({ role: "teacher", client: { rpc } });
    expect((await GET()).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reads only the constrained snapshot RPC for Admin", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: snapshot(), error: null });
    staff.mockResolvedValue({ role: "admin", client: { rpc } });
    expect((await GET()).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operational_snapshot");
  });
  it("does not reveal database error internals", async () => {
    staff.mockResolvedValue({
      role: "admin",
      client: {
        rpc: vi
          .fn()
          .mockResolvedValue({ error: { message: "secret SQL details" } }),
      },
    });
    const r = await GET();
    expect(r.status).toBe(422);
    expect(await r.text()).not.toContain("secret SQL details");
  });
});
