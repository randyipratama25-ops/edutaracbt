import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { restoreRows } from "./restore-drill.mjs";
import { stagingDatabase } from "./stage4-local-db.mjs";

const db = await stagingDatabase();
const org = "6e143c55-7be5-4e6e-9f1a-8f8db429956a";
const uid = (n) => `03000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sid = (n) => `13000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function actor(n) {
  await db.exec("reset role; set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: uid(n), session_id: sid(n), role: "authenticated" }),
  ]);
}
async function command(action, fields = {}) {
  return (
    await db.query("select public.committee_command($1::jsonb) as result", [
      JSON.stringify({ action, ...fields }),
    ])
  ).rows[0].result;
}
async function rejectCall(run, reason) {
  await db.exec("savepoint denied");
  try {
    await assert.rejects(run, reason);
  } finally {
    await db.exec("rollback to denied; release denied");
  }
}

const reject = (action, fields, reason) => rejectCall(() => command(action, fields), reason);
const options = async () => (await db.query("select public.supervisor_options() as result")).rows[0].result.exams;
const operate = async (rpc, input) => (
  await db.query(`select public.${rpc}($1::jsonb) as result`, [JSON.stringify(input)])
).rows[0].result;

try {
  await db.exec("begin");
  for (const [i, role] of [
    "admin",
    "teacher",
    "committee",
    "supervisor",
    "supervisor",
    "student",
  ].entries()) {
    const n = i + 1;
    await db.query("insert into auth.users(id) values ($1)", [uid(n)]);
    await db.query("insert into auth.sessions(id,user_id) values ($1,$2)", [
      sid(n),
      uid(n),
    ]);
    await db.query(
      "insert into public.profiles(id,organization_id,username,full_name,role) values ($1,$2,$3,$3,$4)",
      [uid(n), org, "committee_fixture_" + n, role],
    );
  }
  const { today, tomorrow } = (
    await db.query(`
    select local_day::text as today, (local_day + 1)::text as tomorrow
    from (select (now() at time zone 'Asia/Jakarta')::date local_day) d
  `)
  ).rows[0];
  const exam = (
    await db.query(
      `
    insert into public.exams(organization_id,title,starts_at,ends_at,duration_minutes,pin_hash)
    values ($1,'Committee fixture',now()-interval '1 day',now()+interval '2 days',30,'fixture') returning id
  `,
      [org],
    )
  ).rows[0].id;
  const room = (
    await db.query(
      `
    insert into public.exam_rooms(organization_id,exam_id,name,capacity)
    values ($1,$2,'Room',30) returning id
  `,
      [org, exam],
    )
  ).rows[0].id;
  const classroom = (await db.query(
    "insert into public.classes(organization_id,name) values($1,'Attendance fixture') returning id", [org],
  )).rows[0].id;
  await db.query("insert into public.exam_classes values($1,$2,$3)", [org, exam, classroom]);
  await db.query("insert into public.student_enrollments(organization_id,student_id,class_id) values($1,$2,$3)", [org, uid(6), classroom]);
  await db.query("insert into public.exam_room_students values($1,$2,$3,$4)", [org, exam, room, uid(6)]);
  const broadcast = {
    action: "broadcast", scope: "selected", exam_id: exam, student_ids: [uid(6)],
    message: "Pemberitahuan penugasan", request_id: randomUUID(),
  };
  const cards = {
    action: "create", exam_id: exam, student_ids: [uid(6)],
    format: "pdf", template: "compact", request_id: randomUUID(),
  };
  const schedule = [];
  for (const date of [today, tomorrow]) {
    const session = (
      await db.query(
        `
      insert into public.exam_sessions(organization_id,exam_id,name,starts_at,ends_at)
      values ($1,$2,$3::text,$3::date::timestamp at time zone 'Asia/Jakarta',now()+interval '2 days') returning id
    `,
        [org, exam, date],
      )
    ).rows[0].id;
    schedule.push(
      (
        await db.query(
          `
      insert into public.supervisor_assignments(organization_id,exam_id,room_id,session_id,original_supervisor_id)
      values ($1,$2,$3,$4,$5) returning id
    `,
          [org, exam, room, session, uid(4)],
        )
      ).rows[0].id,
    );
  }

  const target = { id: schedule[0], substitution_id: null };
  await actor(6);
  assert.deepEqual(await options(), []);
  await actor(4);
  assert.deepEqual(await options(), [{
    id: exam, title: "Committee fixture", pin_configured: true, attendance_confirmed: false,
  }]);
  assert.equal((await operate("ops_command", { action: "monitor", exam_id: exam }))[0].can_act, false);
  await rejectCall(() => operate("ops_command", broadcast), /AUTH/);
  await rejectCall(() => operate("card_command", cards), /AUTH/);
  await actor(6);
  await reject("list", {}, /AUTH/);
  await actor(2);
  assert.equal((await command("list")).status, "unassigned");
  await reject("assign", { date: today, profile_id: uid(2) }, /Hanya Admin/);
  await actor(1);
  await command("assign", { date: today, profile_id: uid(2) });
  await command("assign", { date: tomorrow, profile_id: uid(3) });
  const duty = (await command("list")).duties[0];
  const tomorrowDuty = (await command("list", { date: tomorrow })).duties[0];
  await reject("confirm_committee", { id: tomorrowDuty.id }, /hari tugas/);

  await actor(2);
  const pending = await command("list");
  assert.equal(pending.status, "pending");
  assert.deepEqual(pending.schedule, []);
  await reject("confirm_committee", { id: duty.id }, /Hanya Admin/);
  await reject("confirm_supervisor", target, /Admin harus/);
  await reject(
    "replace_supervisor",
    { ...target, profile_id: uid(5) },
    /Admin harus/,
  );

  await actor(1);
  await command("confirm_committee", { id: duty.id });
  await actor(2);
  const confirmed = await command("list", { date: tomorrow });
  assert.equal(confirmed.date, today);
  assert.deepEqual(
    confirmed.schedule.map((row) => row.id),
    [schedule[0]],
  );
  await reject(
    "confirm_supervisor",
    { ...target, id: schedule[1] },
    /luar hari tugas/,
  );
  await reject(
    "replace_supervisor",
    { ...target, id: schedule[1], profile_id: uid(5) },
    /luar hari tugas/,
  );
  await command("confirm_supervisor", target);
  await command("confirm_supervisor", target);
  assert.ok((await command("list")).schedule[0].confirmed_at);
  await actor(4);
  assert.equal((await options())[0].attendance_confirmed, true);
  assert.equal((await operate("ops_command", broadcast)).recipients, 1);
  const originalCard = await operate("card_command", cards);
  assert.ok(originalCard.id);
  await actor(2);
  await command("replace_supervisor", { ...target, profile_id: uid(5) });
  const substitute = (await command("list")).schedule[0];
  assert.equal(substitute.supervisor_id, uid(5));
  assert.equal(substitute.confirmed_at, null);
  assert.ok(substitute.original_confirmed_at);
  await reject("confirm_supervisor", target, /Pengawas sudah berubah/);
  await db.exec("reset role; commit; begin");
  await actor(4);
  assert.deepEqual(await options(), []);
  await rejectCall(() => operate("ops_command", broadcast), /AUTH/);
  assert.deepEqual(await operate("card_command", { action: "list" }), []);
  await actor(5);
  assert.equal((await options())[0].attendance_confirmed, false);
  await rejectCall(() => operate("ops_command", broadcast), /AUTH/);
  await rejectCall(() => operate("card_command", cards), /AUTH/);
  await actor(2);
  await command("confirm_supervisor", {
    ...target,
    substitution_id: substitute.substitution_id,
  });
  assert.ok((await command("list")).schedule[0].confirmed_at);

  await actor(5);
  assert.equal((await options())[0].attendance_confirmed, true);
  assert.equal((await operate("ops_command", broadcast)).recipients, 1);
  assert.ok((await operate("card_command", cards)).id);

  await actor(1);
  await command("replace_committee", { id: duty.id, profile_id: uid(3) });
  const replacement = (await command("list")).duties.find(
    ({ profile_id }) => profile_id === uid(3),
  );
  assert.equal(replacement.confirmed_at, null);
  await actor(2);
  assert.equal((await command("list")).status, "unassigned");
  await reject("confirm_supervisor", target, /Admin harus/);
  await actor(3);
  assert.equal((await command("list")).status, "pending");
  await actor(1);
  await command("confirm_committee", { id: replacement.id });
  await actor(3);
  assert.equal((await command("list")).status, "confirmed");
  assert.equal((await command("list")).schedule.length, 1);

  await db.exec("reset role");
  await db.query("update public.profiles set active=false where id=$1", [
    uid(4),
  ]);
  await db.exec("commit; begin");
  assert.equal(
    (
      await db.query("select private.effective_supervisor($1) as id", [
        schedule[0],
      ])
    ).rows[0].id,
    uid(5),
  );
  const backup = await db.query(
    "select table_name, count(*)::int as count from private.backup_data($1) where table_name in ('private.exam_committee_duties', 'private.supervisor_attendance') group by table_name order by table_name",
    [org],
  );
  assert.deepEqual(backup.rows, [
    { table_name: "private.exam_committee_duties", count: 3 },
    { table_name: "private.supervisor_attendance", count: 2 },
  ]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from private.supervisor_attendance",
      )
    ).rows[0].count,
    2,
  );
  const artifact = await db.query(
    "select table_name as table, payload as record from private.backup_data($1)",
    [org],
  );
  await db.exec("rollback");
  const restored = await stagingDatabase();
  try {
    await restoreRows(restored, artifact.rows);
    const restoredDuties = await restored.query(
      "select count(*)::int as count from private.exam_committee_duties where replaces_id is not null",
    );
    assert.equal(restoredDuties.rows[0].count, 1);
  } finally {
    await restored.close();
  }
  console.log(
    "PASS committee duties, attendance, replacement, date/role restrictions, scoped PIN status, guarded broadcasts/cards, and isolated restore",
  );
} finally {
  await db.close();
}
