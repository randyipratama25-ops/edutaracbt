import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
export function assertStaging(target, projectRef) {
  const u = new URL(target);
  if (
    u.protocol !== "https:" ||
    !u.hostname.endsWith(".vercel.app") ||
    !u.hostname.includes("-git-") ||
    u.hostname.includes("-git-main-") ||
    !projectRef ||
    projectRef === "cwklpfplqoofvehlyfvd"
  )
    throw Error(
      "Use an isolated non-main preview and a separate Supabase project.",
    );
  return u.origin;
}
export const metrics = (values) => {
  const a = [...values].sort((x, y) => x - y);
  return {
    count: a.length,
    p50_ms: a[Math.max(0, Math.ceil(a.length * 0.5) - 1)] || 0,
    p95_ms: a[Math.max(0, Math.ceil(a.length * 0.95) - 1)] || 0,
    p99_ms: a[Math.max(0, Math.ceil(a.length * 0.99) - 1)] || 0,
  };
};
export async function run() {
  if (process.env.CBT_LOAD_CONFIRM !== "ISOLATED_TEST_DATA")
    throw Error("Explicit isolated-test opt-in required.");
  const base = assertStaging(
    process.env.CBT_STAGING_TARGET,
    process.env.CBT_STAGING_PROJECT_REF,
  );
  const info = await fetch(base + "/api/load-info").then((r) => r.json());
  if (
    !info.data?.isolated ||
    info.data.project_ref !== process.env.CBT_STAGING_PROJECT_REF
  )
    throw Error("Staging marker/project does not match; no mutation sent.");
  const users = JSON.parse(
    readFileSync(process.env.CBT_LOAD_USERS_FILE, "utf8"),
  );
  if (
    !Array.isArray(users) ||
    users.length < 1 ||
    users.length > 300 ||
    users.some((u) => !/^load_[a-z0-9_-]+$/.test(u.username))
  )
    throw Error("Provide 1–300 synthetic load_ users only.");
  const timings = {
    login: [],
    start: [],
    autosave: [],
    resume: [],
    submit: [],
  };
  let requests = 0,
    errors = 0,
    lost = 0,
    completed = 0,
    semanticErrors = 0;
  const failures = [];
  await Promise.all(
    users.map(async (user, index) => {
      let cookies = "";
      const call = async (stage, path, input) => {
        const begin = performance.now();
        requests++;
        try {
          const r = await fetch(base + path, {
            method: "POST",
            headers: {
              Origin: base,
              "Content-Type": "application/json",
              ...(cookies ? { Cookie: cookies } : {}),
            },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(30000),
          });
          if (stage === "login")
            cookies = r.headers
              .getSetCookie()
              .map((v) => v.split(";")[0])
              .join("; ");
          const j = await r.json();
          if (!r.ok) throw Error("HTTP " + r.status);
          timings[stage].push(performance.now() - begin);
          return j.data;
        } catch (e) {
          errors++;
          failures.push({
            client: index + 1,
            stage,
            error:
              e.name === "TimeoutError"
                ? "TIMEOUT"
                : String(e.message).match(/HTTP \d+/)?.[0] || "REQUEST_FAILED",
          });
          throw e;
        }
      };
      try {
        await call("login", "/api/auth/login", {
          username: user.username,
          password: user.password,
          context: "student",
        });
        const client_id = randomUUID();
        const a = await call("start", "/api/attempts", {
          action: "start",
          exam_id: user.exam_id,
          pin: user.pin,
          client_id,
        });
        let revisions = Object.fromEntries(
          a.answers.map((x) => [x.question_id, x.revision]),
        );
        for (let cycle = 0; cycle < 3; cycle++) {
          const request_id = randomUUID(),
            answers = Object.entries(user.answers).map(
              ([question_id, value]) => ({
                question_id,
                value,
                expected_revision: revisions[question_id] || 0,
              }),
            );
          const payload = {
            action: "save",
            attempt_id: a.id,
            client_id,
            epoch: a.epoch,
            request_id,
            answers,
          };
          const ack = await call("autosave", "/api/attempts", payload);
          const replay = await call("autosave", "/api/attempts", payload);
          if (JSON.stringify(ack) !== JSON.stringify(replay))
            throw Error("Idempotency mismatch");
          for (const r of ack.acknowledgements) {
            if (r.error) throw Error("Revision conflict");
            revisions[r.question_id] = r.revision;
          }
        }
        const resumed = await call("resume", "/api/attempts", {
          action: "resume",
          attempt_id: a.id,
          client_id,
        });
        for (const [qid, value] of Object.entries(user.answers))
          if (
            JSON.stringify(
              resumed.answers.find((x) => x.question_id === qid)?.value,
            ) !== JSON.stringify(value)
          )
            lost++;
        if (resumed.deadline_at !== a.deadline_at)
          throw Error("Deadline changed");
        await call("submit", "/api/attempts", {
          action: "submit",
          attempt_id: a.id,
          client_id,
          epoch: a.epoch,
          request_id: randomUUID(),
          mode: "manual",
        });
        completed++;
      } catch (e) {
        semanticErrors++;
        failures.push({ user_index: index, stage: "workflow", message: String(e.message).slice(0, 160) });
      }
    }),
  );
  const report = {
    target_scope: "ISOLATED_STAGING",
    logical_clients: users.length,
    requests,
    errors,
    completed,
    semantic_errors: semanticErrors,
    error_rate: requests ? errors / requests : 0,
    answer_mismatches: lost,
    metrics: Object.fromEntries(
      Object.entries(timings).map(([k, v]) => [k, metrics(v)]),
    ),
    failures,
    capacity_acceptance: process.env.CBT_AUTOSAVE_P95_MS
      ? "CONFIGURED_THRESHOLD"
      : "SLO_NOT_AGREED",
  };
  writeFileSync(
    process.env.CBT_LOAD_REPORT || "/tmp/edutara-load-report.json",
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      clients: users.length,
      requests,
      errors,
      answer_mismatches: lost,
      autosave_p95_ms: report.metrics.autosave.p95_ms,
    }),
  );
  if (
    completed !== users.length ||
    semanticErrors ||
    errors ||
    lost ||
    (process.env.CBT_AUTOSAVE_P95_MS &&
      report.metrics.autosave.p95_ms > Number(process.env.CBT_AUTOSAVE_P95_MS))
  )
    process.exitCode = 1;
}
if (process.argv[1]?.endsWith("/load/attempts.mjs")) await run();
