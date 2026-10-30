// Offline release decision only: this tool never changes deployments or databases.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const proof = z
  .object({
    passed: z.literal(true),
    candidate_sha: sha,
    recorded_at: z.iso.datetime({ offset: true }),
    artifact: z
      .string()
      .min(5)
      .max(300)
      .refine((v) => !/[?]|token=|password|service_role/i.test(v)),
  })
  .strict();
export const requiredProofs = [
  "owner_release",
  "uat_all_roles_devices",
  "security",
  "load_slo",
  "staging_smoke",
  "rollback_drill",
  "final_backup_verified",
  "account_recovery",
];
const schema = z
  .object({
    format: z.literal("edutara-release-v2"),
    candidate_sha: sha,
    production_project: z.literal("cwklpfplqoofvehlyfvd"),
    production_origin: z.literal("https://edutara-cbt-ashen.vercel.app"),
    observed_at: z.iso.datetime({ offset: true }),
    active_attempts: z.number().int().nonnegative(),
    scheduler_count: z.number().int().nonnegative(),
    schedulers: z
      .array(
        z
          .object({
            name: z.string(),
            active: z.boolean(),
            schedule: z.string(),
          })
          .strict(),
      )
      .length(3),
    backup: z
      .object({
        id: z.uuid(),
        completed_at: z.iso.datetime({ offset: true }),
        checksum: z.string().regex(/^[a-f0-9]{64}$/),
        status: z.literal("succeeded"),
      })
      .strict(),
    data_mode: z.enum(["legacy", "fresh"]),
    observation_minutes: z.number().int().min(30).max(1440),
    proofs: z.record(z.string(), proof),
  })
  .strict();
export function evaluateRelease(input, now = new Date()) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ready: false,
      blockers: ["Manifest incomplete or invalid; no cutover authorized."],
    };
  const m = parsed.data,
    blockers = [];
  const age = (date) => now.getTime() - Date.parse(date);
  if (!Number.isFinite(now.getTime())) throw Error("Invalid clock");
  if (age(m.observed_at) < 0 || age(m.observed_at) > 5 * 60000)
    blockers.push("Refresh production preflight within five minutes.");
  if (m.active_attempts !== 0)
    blockers.push("Active attempts must finish before cutover.");
  if (m.scheduler_count !== 1)
    blockers.push("Exactly one operations scheduler is required.");
  const expectedSchedulers = {
    "edutara-operations": "* * * * *",
    "edutara-recovery-retention": "*/15 * * * *",
    "edutara-results-publication": "* * * * *",
  };
  for (const [name, schedule] of Object.entries(expectedSchedulers))
    if (
      m.schedulers.filter(
        (j) => j.name === name && j.active && j.schedule === schedule,
      ).length !== 1
    )
      blockers.push(
        `Missing, duplicate, inactive or changed scheduler: ${name}.`,
      );
  if (age(m.backup.completed_at) < 0 || age(m.backup.completed_at) > 3600000)
    blockers.push("Verify a final backup completed within one hour.");
  const required = [
    ...requiredProofs,
    ...(m.data_mode === "legacy"
      ? ["legacy_freeze", "delta_parity"]
      : ["owner_fresh_start"]),
  ];
  for (const key of required) {
    const p = m.proofs[key];
    if (
      !p ||
      p.candidate_sha !== m.candidate_sha ||
      age(p.recorded_at) < 0 ||
      age(p.recorded_at) > 7 * 86400000
    )
      blockers.push(`Missing, stale or wrong-commit evidence: ${key}.`);
  }
  return {
    ready: blockers.length === 0,
    blockers,
    candidate_sha: m.candidate_sha,
    execution: "manual-reviewed-runbook-only",
  };
}
// Supply the entire live protected-row inventory immediately BEFORE and AFTER an app rollback.
// A historical backup alone is insufficient: all post-backup rows must survive too.
export function assertAnswersPreserved(before, after) {
  const inventory = z.array(
    z
      .object({
        table: z.enum([
          "public.exam_attempts",
          "public.attempt_answers",
          "private.answer_revisions",
          "public.answer_media",
          "public.grade_items",
          "private.grading_revisions",
          "private.attempt_questions",
          "private.essay_grades",
          "private.essay_grade_history",
          "private.bank_items",
          "private.bank_versions",
          "private.bank_reviews",
          "private.bank_packs",
          "private.bank_usage",
          "private.grade_moderations",
          "private.result_publications",
          "private.exam_help_requests",
        ]),
        key: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  );
  const a = inventory.parse(before),
    b = inventory.parse(after);
  if (!a.length)
    throw Error("Empty inventory cannot prove answer preservation.");
  const index = (rows) => {
    const map = new Map();
    for (const r of rows) {
      const key = JSON.stringify([r.table, r.key]);
      if (map.has(key)) throw Error("Duplicate protected row key.");
      map.set(key, r.sha256);
    }
    return map;
  };
  const old = index(a),
    current = index(b);
  for (const [key, value] of old)
    if (current.get(key) !== value)
      throw Error(
        "Rollback lost or changed a protected answer/attempt/grade row.",
      );
  return { preserved: a.length, additional_rows: b.length - a.length };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = evaluateRelease(
      JSON.parse(readFileSync(process.argv[2], "utf8")),
    );
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 2;
  } catch {
    console.error(
      "Release gate refused: provide a valid local evidence manifest.",
    );
    process.exitCode = 2;
  }
}
