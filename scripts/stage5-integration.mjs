import { stagingDatabase } from "./stage4-local-db.mjs";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = await stagingDatabase();
const uid = (n) => `03000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = async (n) => {
  await db.exec("reset role;set local role authenticated");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: uid(n),
      session_id: `13000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      role: "authenticated",
    }),
  ]);
};
const owner = () => db.exec("reset role");
const rpc = async (input, name = "ops_command") =>
  (
    await db.query(`select public.${name}($1::jsonb) r`, [
      JSON.stringify(input),
    ])
  ).rows[0].r;
const command = (input) => rpc({ request_id: randomUUID(), ...input });
const reject = async (fn) => {
  await db.exec("savepoint rejected");
  let err;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  await db.exec("rollback to savepoint rejected;release savepoint rejected");
  assert.ok(err, "operation must reject");
};
try {
  await db.exec(
    readFileSync("supabase/tests/attempts.sql", "utf8").replace(
      /rollback;\s*$/,
      "",
    ),
  );
  console.log("PASS complete schema and prior attempt lifecycle regression");
  await owner();
  const aid = (await db.query("select current_setting('test.attempt') id"))
    .rows[0].id;
  const exam = "53000000-0000-4000-8000-000000000001",
    room = "73000000-0000-4000-8000-000000000001";
  await actor(1);
  const rooms = await rpc({ action: "rooms", exam_id: exam });
  const assignment = rooms.assignments[0].id;
  await command({
    action: "substitute",
    id: assignment,
    supervisor_id: uid(5),
    starts_at: new Date(Date.now() - 60000).toISOString(),
    ends_at: new Date(Date.now() + 3600000).toISOString(),
  });
  await actor(4);
  assert.equal((await rpc({ action: "monitor", exam_id: exam })).length, 0);
  await reject(() => rpc({ action: "history", id: aid }));
  await actor(5);
  assert.equal((await rpc({ action: "monitor", exam_id: exam })).length, 1);
  assert.ok(await rpc({ action: "history", id: aid }));
  await owner();
  assert.equal(
    (await db.query("select role from public.profiles where id=$1", [uid(5)]))
      .rows[0].role,
    "teacher",
  );
  await actor(1);
  await command({ action: "revoke", id: assignment });
  await actor(5);
  await reject(() => rpc({ action: "history", id: aid }));
  await actor(4);
  assert.equal((await rpc({ action: "monitor", exam_id: exam })).length, 1);
  await actor(1);
  const unlimited = await command({
    action: "room_save",
    exam_id: exam,
    name: "Unlimited",
    capacity: 0,
  });
  await reject(() =>
    command({
      action: "roster_add",
      exam_id: exam,
      id: unlimited.id,
      student_ids: [uid(2)],
    }),
  );
  await reject(() =>
    command({
      action: "roster_add",
      exam_id: exam,
      id: unlimited.id,
      student_ids: [uid(3)],
    }),
  );
  await owner();
  await db.exec(
    "insert into public.student_enrollments(organization_id,student_id,class_id) values('6e143c55-7be5-4e6e-9f1a-8f8db429956a','03000000-0000-4000-8000-000000000003','33000000-0000-4000-8000-000000000001')",
  );
  await actor(1);
  await command({
    action: "roster_add",
    exam_id: exam,
    id: unlimited.id,
    student_ids: [uid(3)],
  });
  await reject(() =>
    command({
      action: "roster_add",
      exam_id: exam,
      id: room,
      student_ids: [uid(3)],
    }),
  );
  const session = await command({
    action: "session_save",
    exam_id: exam,
    name: "Session 1",
    starts_at: new Date(Date.now()).toISOString(),
    ends_at: new Date(Date.now() + 1800000).toISOString(),
  });
  await command({
    action: "assign",
    exam_id: exam,
    room_id: unlimited.id,
    session_id: session.id,
    supervisor_id: uid(5),
  });
  const notice = {
    action: "broadcast",
    request_id: randomUUID(),
    scope: "selected",
    exam_id: exam,
    student_ids: [uid(2), uid(2)],
    message: "Pesan uji",
  };
  const sent = await rpc(notice);
  assert.equal(sent.recipients, 1);
  assert.deepEqual(await rpc(notice), sent);
  await actor(2);
  const inbox = await rpc({ action: "inbox" });
  assert.equal(inbox.length, 1);
  await rpc({ action: "read", id: sent.id });
  const read = (await rpc({ action: "inbox" }))[0].read_at;
  await rpc({ action: "read", id: sent.id });
  assert.equal((await rpc({ action: "inbox" }))[0].read_at, read);
  await reject(() =>
    command({
      action: "room_save",
      exam_id: exam,
      name: "hacked",
      capacity: 0,
    }),
  );
  await actor(1);
  const cards = await rpc(
    {
      action: "create",
      request_id: randomUUID(),
      exam_id: exam,
      student_ids: [uid(2)],
      format: "pdf",
      template: "compact",
    },
    "card_command",
  );
  const job = await rpc({ action: "claim", job_id: cards.id }, "card_command");
  assert.ok(job.lease);
  assert.ok(!JSON.stringify(job.snapshot).includes("password"));
  assert.equal(
    (await rpc({ action: "claim", job_id: cards.id }, "card_command")).busy,
    true,
  );
  await reject(() =>
    rpc(
      { action: "finish", job_id: cards.id, lease: job.lease, path: "bad.pdf" },
      "card_command",
    ),
  );

  await owner();
  await db.exec(
    `insert into auth.users(id,email) select ('03000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ops-fixture'||n||'@example.invalid' from generate_series(6,7)n;insert into public.profiles(id,organization_id,username,full_name,role) select ('03000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'6e143c55-7be5-4e6e-9f1a-8f8db429956a','ops_fixture_'||n,'Ops fixture '||n,'student' from generate_series(6,7)n;insert into public.student_enrollments(organization_id,student_id,class_id) select '6e143c55-7be5-4e6e-9f1a-8f8db429956a',('03000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'33000000-0000-4000-8000-000000000001' from generate_series(6,7)n;`,
  );
  await actor(1);
  const finite = await command({
    action: "room_save",
    exam_id: exam,
    name: "Capacity one",
    capacity: 1,
  });
  await reject(() =>
    command({
      action: "roster_add",
      exam_id: exam,
      id: finite.id,
      student_ids: [uid(6), uid(7)],
    }),
  );
  await owner();
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.exam_room_students where room_id=$1",
        [finite.id],
      )
    ).rows[0].n,
    0,
  );
  await actor(1);
  await command({
    action: "roster_add",
    exam_id: exam,
    id: finite.id,
    student_ids: [uid(6)],
  });
  await reject(() =>
    command({
      action: "roster_add",
      exam_id: exam,
      id: finite.id,
      student_ids: [uid(7)],
    }),
  );
  await owner();
  await db.exec(
    `insert into public.media_assets(id,organization_id,uploader_id,object_path,mime_type,byte_size) values('a3000000-0000-4000-8000-000000000009','6e143c55-7be5-4e6e-9f1a-8f8db429956a','03000000-0000-4000-8000-000000000005','03000000-0000-4000-8000-000000000005/unused.png','image/png',128);insert into storage.objects(bucket_id,name,metadata) values('exam-media','03000000-0000-4000-8000-000000000005/unused.png','{"size":128}');`,
  );
  await actor(5);
  const write = await db.query(
    "update storage.objects set metadata='{}' where name='03000000-0000-4000-8000-000000000005/unused.png' returning id",
  );
  assert.equal(write.rows.length, 0);
  const deletion = await rpc(
    { action: "delete", id: "a3000000-0000-4000-8000-000000000009" },
    "media_command",
  );
  assert.ok(deletion.cleanup_id);
  assert.equal(
    (await rpc({ action: "cleanup_list" }, "media_command")).length,
    1,
  );
  await rpc(
    { action: "cleanup_done", id: deletion.cleanup_id },
    "media_command",
  );
  assert.equal(
    (await rpc({ action: "cleanup_list" }, "media_command")).length,
    0,
  );
  await actor(1);
  let rows = await rpc({ action: "monitor", exam_id: exam });
  const first = rows.find((r) => r.attempt_id === aid);
  const reset = {
    action: "reset",
    request_id: randomUUID(),
    attempts: [{ id: aid, version: first.version }],
    reason: "Pengujian reset aman",
    confirmation: "KONFIRMASI",
  };
  await rpc(reset);
  await rpc(reset);
  await owner();
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.attempt_answers where attempt_id=$1",
        [aid],
      )
    ).rows[0].n,
    5,
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from private.attempt_overrides where attempt_id=$1",
        [aid],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query("select status from public.exam_attempts where id=$1", [
        aid,
      ])
    ).rows[0].status,
    "reset",
  );
  await owner();
  await db.query("delete from private.login_budgets where key=$1", [
    "attempt-pin:" + uid(2),
  ]);
  await actor(2);
  const newAttempt = await rpc(
    { action: "start", exam_id: exam, client_id: randomUUID(), pin: "887766" },
    "attempt_command",
  );
  assert.ok(newAttempt.id, newAttempt.message || newAttempt.error);
  assert.notEqual(newAttempt.id, aid);
  await owner();
  assert.equal(
    Date.parse(newAttempt.deadline_at),
    new Date(
      (
        await db.query(
          "select deadline_at from public.exam_attempts where id=$1",
          [aid],
        )
      ).rows[0].deadline_at,
    ).getTime(),
  );
  await actor(1);
  await reject(() =>
    rpc(
      { action: "delete", id: "a3000000-0000-4000-8000-000000000001" },
      "media_command",
    ),
  );
  console.log(
    "PASS replacement/revocation, teacher role retained, exact scope, unlimited capacity/duplicates/eligibility, session FK, notification unique receipts/idempotency/read marker, cards private leases, reset archives/evidence/sequence/fixed deadline, referenced media protected",
  );
  await db.exec("rollback");
  await db.exec(readFileSync("supabase/proposals/stage5-disable.sql", "utf8"));
  const rights = (
    await db.query(
      "select has_function_privilege('authenticated','public.ops_command(jsonb)','execute') as ops,has_function_privilege('authenticated','public.card_command(jsonb)','execute') as cards",
    )
  ).rows[0];
  assert.equal(rights.ops, false);
  assert.equal(rights.cards, false);
  assert.ok(
    (
      await db.query(
        "select to_regclass('private.attempt_overrides') as preserved",
      )
    ).rows[0].preserved,
  );
  console.log(
    "PASS non-destructive disable/rollback retains operational history",
  );
} catch (e) {
  console.error(e.message, e.query, e.params);
  process.exitCode = 1;
} finally {
  await db.close();
}
