import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { stagingDatabase } from "./stage4-local-db.mjs";

const db = await stagingDatabase();
const client = randomUUID();
const exam = "53000000-0000-4000-8000-000000000001";
const profile = (n) => `03000000-0000-4000-8000-00000000000${n}`;
async function actor(n) {
  await db.exec("reset role; set local role authenticated");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: profile(n),
      session_id: `13000000-0000-4000-8000-00000000000${n}`,
      role: "authenticated",
    }),
  ]);
}
async function rpc(name, input) {
  return (
    await db.query(`select public.${name}($1::jsonb) as result`, [
      JSON.stringify(input),
    ])
  ).rows[0].result;
}
async function rejects(name, input, pattern) {
  await db.exec("savepoint denied");
  try {
    await assert.rejects(rpc(name, input), pattern);
  } finally {
    await db.exec("rollback to denied; release denied");
  }
}

try {
  const fixture = readFileSync("supabase/tests/attempts.sql", "utf8");
  await db.exec(
    fixture.slice(0, fixture.indexOf("create function pg_temp.assert_test")),
  );
  await actor(2);
  const attempt = await rpc("attempt_command", {
    action: "start",
    exam_id: exam,
    client_id: client,
    pin: "887766",
  });
  const writer = {
    attempt_id: attempt.id,
    client_id: client,
    epoch: attempt.epoch,
  };
  const group = randomUUID();
  const start = {
    ...writer,
    action: "event",
    event_id: randomUUID(),
    group_id: group,
    kind: "visibility_start",
    occurred_at: new Date().toISOString(),
    question_id: attempt.questions[1].id,
  };
  assert.equal((await rpc("attempt_command", start)).recorded, true);
  assert.equal((await rpc("attempt_command", start)).recorded, true);
  const historyInput = { action: "history", attempt_id: attempt.id };
  await rejects("integrity_command", historyInput, /AUTH/);
  await actor(5);
  await rejects("integrity_command", historyInput, /AUTH/);
  await actor(4);
  let history = await rpc("integrity_command", historyInput);
  assert.equal(history.events.length, 1);
  assert.equal(history.events[0].group_id, group);
  assert.equal(history.events[0].metadata.question_number, 2);
  await db.exec("reset role");
  await db.query(
    "update private.integrity_events set created_at=now()-interval '15 seconds' where event_id=$1",
    [start.event_id],
  );
  await actor(4);
  const monitor = () =>
    rpc("ops_command", { action: "monitor", exam_id: exam });
  const ownRow = (rows) => rows.find((row) => row.attempt_id === attempt.id);
  assert.equal(ownRow(await monitor()).open_integrity, 1);
  assert.ok(ownRow(await monitor()).last_seen_at);

  await actor(2);
  await rpc("attempt_command", {
    ...start,
    kind: "visibility_hidden",
    event_id: randomUUID(),
    duration_ms: 22000,
  });
  await rpc("attempt_command", {
    ...start,
    kind: "focus_loss",
    event_id: randomUUID(),
    duration_ms: 22000,
  });
  await actor(4);
  history = await rpc("integrity_command", historyInput);
  assert.equal(history.events.length, 3);
  assert.equal(history.events.filter((event) => event.countable).length, 1);

  const warning = {
    action: "warn",
    attempt_id: attempt.id,
    group_id: group,
    request_id: randomUUID(),
    message: "Mohon kembali ke halaman ujian.",
  };
  assert.deepEqual(await rpc("integrity_command", warning), { saved: true });
  assert.deepEqual(await rpc("integrity_command", warning), { saved: true });
  await rejects(
    "integrity_command",
    { ...warning, message: "Payload berbeda" },
    /CONFLICT/,
  );
  await rpc("integrity_command", {
    ...warning,
    action: "note",
    request_id: randomUUID(),
    message: "Siswa memberi klarifikasi kepada pengawas.",
  });

  await actor(2);
  const resumed = await rpc("attempt_command", { ...writer, action: "resume" });
  assert.deepEqual(resumed.integrity_warnings, [
    { id: warning.request_id, message: warning.message },
  ]);
  assert.equal(resumed.status, "in_progress");
  assert.equal(resumed.deadline_at, attempt.deadline_at);
  assert.equal(resumed.epoch, attempt.epoch);

  await actor(4);
  await rpc("integrity_command", {
    ...warning,
    action: "resolve",
    request_id: randomUUID(),
    message: "Klarifikasi telah diperiksa.",
  });
  assert.equal(ownRow(await monitor()).open_integrity, 0);
  await rejects(
    "integrity_command",
    { ...warning, request_id: randomUUID() },
    /sudah ditutup/,
  );
  history = await rpc("integrity_command", historyInput);
  assert.equal(history.followups.length, 3);
  assert.ok(history.followups.every((entry) => entry.actor));
  console.log(
    "PASS integrity capture, grouping, idempotency, scope, active warning and resolution",
  );
  await db.exec("rollback");
} finally {
  await db.close();
}
