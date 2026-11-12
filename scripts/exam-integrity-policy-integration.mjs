import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { stagingDatabase } from "./stage4-local-db.mjs";

const db = await stagingDatabase();
const exam = (n) => `53000000-0000-4000-8000-00000000000${n}`;
const profile = (n) => `03000000-0000-4000-8000-00000000000${n}`;
const question = "63000000-0000-4000-8000-000000000001";
const oldDevice = randomUUID(),
  newDevice = randomUUID(),
  otherDevice = randomUUID(),
  newSession = randomUUID();
async function actor(n, session = `13000000-0000-4000-8000-00000000000${n}`) {
  await db.exec("reset role; set local role authenticated");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: profile(n),
      session_id: session,
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
const policy = (input) => rpc("exam_integrity_command", input);
const attempt = (input) => rpc("attempt_command", input);
async function rejects(run, pattern) {
  await db.exec("savepoint denied");
  try {
    await assert.rejects(run, pattern);
  } finally {
    await db.exec("rollback to denied; release denied");
  }
}
async function seedPack(qid, indicator) {
  const pack = randomUUID(),
    item = randomUUID();
  const metadata = { indicator, difficulty: "medium", cognitive: "C2" };
  await db.query(
    "insert into private.bank_packs(id,exam_id,rules,actor_id) values($1,$2,'[]',$3)",
    [pack, exam(1), profile(5)],
  );
  await db.query(
    "insert into private.bank_items(id,organization_id,owner_id,metadata,state) select $1,organization_id,$2,$3,'approved' from public.exams where id=$4",
    [item, profile(5), metadata, exam(1)],
  );
  await db.query(
    "insert into private.bank_versions(item_id,version,metadata,payload,checksum,actor_id,reason) select $1,1,$2,payload,'fixture',$3,'fixture' from public.question_versions where question_id=$4 and version=1",
    [item, metadata, profile(5), qid],
  );
  await db.query("insert into private.bank_usage values($1,$2,1,$3,1,10)", [
    pack,
    item,
    qid,
  ]);
  return pack;
}

try {
  const fixture = readFileSync("supabase/tests/attempts.sql", "utf8");
  await db.exec(
    fixture.slice(0, fixture.indexOf("create function pg_temp.assert_test")),
  );
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
    newSession,
    profile(2),
  ]);
  await db.query(
    "update public.exams set status='draft' where id in ($1,$2,$3)",
    [exam(1), exam(2), exam(3)],
  );
  const questions = [question, randomUUID(), randomUUID()];
  for (const id of questions.slice(1)) {
    await db.query(
      "insert into public.questions(id,organization_id,exam_id,type,points) select $1,organization_id,exam_id,type,points from public.questions where id=$2",
      [id, question],
    );
    await db.query(
      "insert into public.question_versions(question_id,version,payload) select $1,1,jsonb_set(payload,'{stem}',to_jsonb($1::uuid::text)) from public.question_versions where question_id=$2 and version=1",
      [id, question],
    );
  }
  const packs = [];
  for (let i = 0; i < questions.length; i++)
    packs.push(
      await seedPack(
        questions[i],
        i < 2 ? "Mengenali konsep" : "Indikator berbeda",
      ),
    );
  const save = {
    action: "save",
    exam_id: exam(1),
    profile: "strict",
    packs: packs.slice(0, 2),
    accommodations: [],
    watermark: true,
    focus_ms: 1100,
    hidden_seconds: 6,
    fullscreen_review: true,
  };
  await actor(5);
  await rejects(() => policy(save), /Hanya Admin/);
  await actor(1);
  await rejects(
    () => policy({ ...save, packs: [packs[0], packs[2]] }),
    /harus setara/,
  );
  await rejects(
    () => policy({ ...save, accommodations: [profile(3)] }),
    /kelas ujian/,
  );
  assert.equal((await policy(save)).available_packs.length, 3);
  await policy({
    ...save,
    exam_id: exam(2),
    profile: "practice",
    packs: [],
    watermark: false,
  });
  await policy({
    ...save,
    exam_id: exam(3),
    profile: "standard",
    packs: [],
    accommodations: [profile(2)],
    watermark: false,
  });
  await db.exec("reset role");
  await db.query(
    "update public.exams set status='active' where id in ($1,$2,$3)",
    [exam(1), exam(2), exam(3)],
  );

  await actor(2);
  const listing = await attempt({ action: "list" });
  assert.equal(
    listing.exams.find((entry) => entry.id === exam(1)).integrity_policy
      .approval_required,
    true,
  );
  assert.equal(
    listing.exams.find((entry) => entry.id === exam(3)).integrity_policy
      .accommodated,
    true,
  );
  const start = (id) =>
    attempt({
      action: "start",
      exam_id: id,
      client_id: oldDevice,
      pin: "887766",
    });
  const started = await start(exam(1));
  assert.equal(started.questions.length, 1);
  assert.ok(questions.slice(0, 2).includes(started.questions[0].id));
  assert.match(started.watermark_code, /^[0-9A-F]{12}$/);
  assert.equal(started.policy.integrity_mode, "strict");
  assert.equal(started.policy.tolerance_ms, 1100);
  assert.equal(started.policy.hidden_seconds, 6);
  assert.equal(started.policy.fullscreen_review, true);
  assert.equal(started.policy.pack_id, undefined);

  const event = (current, duration_ms = 1200) =>
    attempt({
      action: "event",
      attempt_id: current.id,
      epoch: current.epoch,
      client_id: oldDevice,
      kind: "focus_loss",
      duration_ms,
      event_id: randomUUID(),
      group_id: randomUUID(),
    });
  await event(started, 1050);
  await event(started);
  await attempt({
    action: "event",
    attempt_id: started.id,
    client_id: oldDevice,
    epoch: started.epoch,
    kind: "fullscreen_exit",
    event_id: randomUUID(),
    group_id: randomUUID(),
    duration_ms: 0,
  });
  const practice = await start(exam(2));
  const accommodated = await start(exam(3));
  await event(practice, 3000);
  await event(accommodated, 3000);
  await db.exec("reset role");
  const flagged = await db.query(
    "select attempt_id,kind from private.integrity_events where countable order by kind",
  );
  assert.deepEqual(flagged.rows, [
    { attempt_id: started.id, kind: "focus_loss" },
    { attempt_id: started.id, kind: "fullscreen_exit" },
  ]);

  await actor(2, newSession);
  const takeover = (client_id) =>
    attempt({ action: "takeover", attempt_id: started.id, client_id });
  const pending = await takeover(newDevice);
  assert.match(pending.error, /TRANSFER_PENDING/);
  assert.deepEqual(await takeover(newDevice), pending);
  const otherPending = await takeover(otherDevice);
  assert.notEqual(otherPending.error, pending.error);
  await actor(5);
  assert.deepEqual(await policy({ action: "transfers", exam_id: exam(1) }), []);
  await actor(4);
  const transfers = await policy({ action: "transfers", exam_id: exam(1) });
  assert.equal(transfers.length, 2);
  const wanted = transfers.find((row) => pending.error.includes(row.code));
  const denied = transfers.find((row) => otherPending.error.includes(row.code));
  assert.ok(wanted && denied);
  assert.deepEqual(await policy({ action: "approve", id: wanted.id }), {
    saved: true,
  });
  assert.deepEqual(await policy({ action: "deny", id: denied.id }), {
    saved: true,
  });
  const monitor = await rpc("ops_command", {
    action: "monitor",
    exam_id: exam(1),
  });
  assert.equal(
    monitor.find((row) => row.attempt_id === started.id).watermark_code,
    started.watermark_code,
  );
  await actor(2);
  const stillActive = await attempt({
    action: "resume",
    attempt_id: started.id,
    client_id: oldDevice,
  });
  assert.equal(stillActive.epoch, started.epoch);
  const saveAnswer = {
    action: "save",
    attempt_id: started.id,
    client_id: oldDevice,
    epoch: started.epoch,
    request_id: randomUUID(),
    answers: [
      {
        question_id: started.questions[0].id,
        expected_revision: 0,
        value: ["A"],
      },
    ],
  };
  const savedAnswer = await attempt(saveAnswer);
  assert.equal(savedAnswer.acknowledgements[0].revision, 1);
  await actor(2, newSession);
  assert.match((await takeover(otherDevice)).error, /TRANSFER_DENIED/);
  const resumed = await takeover(newDevice);
  assert.equal(resumed.epoch, started.epoch + 1);
  assert.equal(resumed.deadline_at, started.deadline_at);
  assert.deepEqual(resumed.questions, started.questions);
  assert.deepEqual(resumed.answers[0].value, ["A"]);
  assert.equal(resumed.watermark_code, started.watermark_code);
  assert.equal((await takeover(newDevice)).epoch, resumed.epoch);
  await actor(2);
  await rejects(
    () =>
      attempt({
        action: "resume",
        attempt_id: started.id,
        client_id: oldDevice,
      }),
    /DEVICE_CONFLICT/,
  );
  await rejects(
    () => attempt({ ...saveAnswer, request_id: randomUUID() }),
    /DEVICE_CONFLICT/,
  );
  const freeTransfer = await attempt({
    action: "takeover",
    attempt_id: practice.id,
    client_id: newDevice,
  });
  assert.equal(freeTransfer.epoch, practice.epoch + 1);

  await actor(1);
  await rejects(() => policy(save), /dikunci/);
  console.log(
    "PASS exam profiles, accommodations, equivalent packs, watermark and supervised transfers",
  );
  await db.exec("rollback");
} finally {
  await db.close();
}
