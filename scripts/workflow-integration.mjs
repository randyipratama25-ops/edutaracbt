import { stagingDatabase } from "./stage4-local-db.mjs";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = await stagingDatabase();
const org = "6e143c55-7be5-4e6e-9f1a-8f8db429956a",
  eid = "53000000-0000-4000-8000-000000000001",
  cid = "33000000-0000-4000-8000-000000000001",
  sid = "43000000-0000-4000-8000-000000000001",
  client = randomUUID();
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
const rpc = async (name, input) =>
  (
    await db.query(`select public.${name}($1::jsonb) r`, [
      JSON.stringify(input),
    ])
  ).rows[0].r;
const flow = (input) => rpc("workflow_command", input);
const denied = async (fn, pattern) => {
  await db.exec("savepoint rejected");
  await assert.rejects(fn, pattern);
  await db.exec("rollback to savepoint rejected;release savepoint rejected");
};
try {
  const fixture = readFileSync("supabase/tests/attempts.sql", "utf8");
  await db.exec(
    fixture.slice(0, fixture.indexOf("create function pg_temp.assert_test")),
  );
  await db.query(
    "insert into public.subjects(id,organization_id,name) values($1,$2,$3)",
    [sid, org, "IPS workflow"],
  );
  const exam = {
    title: "Persiapan IPS",
    subject_id: sid,
    class_ids: [cid],
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    ends_at: new Date(Date.now() + 90000000).toISOString(),
    duration_minutes: 45,
    pin: "123456",
    passing_grade: 70,
    status: "draft",
    bypass_period: false,
    shuffle_questions: true,
    shuffle_options: true,
    configs: ["PG", "PG_KOMPLEKS", "BS", "JODOH", "Esai"].map((type) => ({
      type,
      enabled: true,
      max_questions: 0,
      option_count: 2,
      default_points: 1,
    })),
  };
  await actor(1);
  const creation = { action: "exam", exam, request_id: randomUUID() };
  const id = (await rpc("authoring_command", creation)).id;
  assert.equal((await rpc("authoring_command", creation)).id, id);
  await denied(
    () =>
      rpc("authoring_command", {
        ...creation,
        exam: { ...exam, title: "Different retry" },
      }),
    /IDEMPOTENCY_CONFLICT/,
  );
  let d = (await flow({ action: "preparation", exam_id: id })).exams[0];
  assert.equal(d.ready, false);
  assert.equal(d.lifecycle, "Draf");
  assert.equal(d.participants, 1);
  assert.equal(d.unconfirmed, 1);
  await denied(
    () =>
      flow({
        action: "publish",
        exam_id: id,
        request_id: randomUUID(),
        confirmation: "PUBLIKASIKAN",
      }),
    /READINESS/,
  );
  await denied(
    () =>
      rpc("authoring_command", {
        action: "exam",
        exam: { ...exam, title: "Illegal shortcut", status: "scheduled" },
      }),
    /READINESS/,
  );
  const question = {
    type: "PG",
    explanation: "",
    rubric: "",
    keywords: [],
    distractors: [],
    canvas: { enabled: false, width: 1000, height: 600 },
    stem: "Alur persiapan",
    points: 1,
    required: true,
    options: [
      { id: "A", text: "Benar" },
      { id: "B", text: "Salah" },
    ],
    key: ["A"],
    attachments: [],
    minChars: 0,
    direction: "ltr",
  };
  const saved = await rpc("authoring_command", {
    action: "questions",
    exam_id: id,
    request_id: randomUUID(),
    items: [question],
  });
  assert.equal(saved.saved, 1, JSON.stringify(saved));
  d = (await flow({ action: "preparation", exam_id: id })).exams[0];
  assert.equal(d.ready, true, JSON.stringify(d));
  assert.equal(d.lifecycle, "Siap Ditinjau");
  assert.equal(d.checks.find((c) => c.code === "accounts").blocking, false);
  await actor(5);
  assert.deepEqual(
    (await flow({ action: "preparation", exam_id: id })).exams,
    [],
  );
  await denied(
    () =>
      flow({
        action: "publish",
        exam_id: id,
        request_id: randomUUID(),
        confirmation: "PUBLIKASIKAN",
      }),
    /Admin/,
  );
  await owner();
  await db.query(
    "insert into public.teacher_assignments(organization_id,teacher_id,class_id,subject_id) values($1,$2,$3,$4)",
    [org, uid(5), cid, sid],
  );
  await actor(5);
  assert.equal(
    (await flow({ action: "preparation", exam_id: id })).exams.length,
    1,
  );
  await actor(1);
  const pub = {
    action: "publish",
    exam_id: id,
    request_id: randomUUID(),
    confirmation: "PUBLIKASIKAN",
  };
  const published = await flow(pub);
  assert.deepEqual(await flow(pub), published);
  assert.equal(
    (await flow({ action: "preparation", exam_id: id })).exams[0].lifecycle,
    "Terjadwal",
  );
  await rpc("authoring_command", {
    action: "questions",
    exam_id: id,
    request_id: randomUUID(),
    items: [{ ...question, stem: "Perubahan setelah publikasi" }],
  });
  assert.equal(
    (await flow({ action: "preparation", exam_id: id })).exams[0].status,
    "draft",
  );
  const preview = await flow({
    action: "import_preview",
    items: [
      { username: "attempt_fixture_2", role: "student" },
      { username: "belum_ada", role: "student", class_id: cid },
    ],
  });
  assert.match(preview[0].error, /digunakan/);
  assert.equal(preview[1].error, "");
  await actor(5);
  assert.match(
    (
      await flow({
        action: "import_preview",
        items: [{ username: "guru_baru", role: "teacher" }],
      })
    )[0].error,
    /Guru/,
  );
  await actor(2);
  await denied(() => flow({ action: "preparation" }), /AUTH/);
  const started = await rpc("attempt_command", {
    action: "start",
    exam_id: eid,
    client_id: client,
    pin: "887766",
  });
  const aid = started.id;
  const request = {
    action: "help",
    attempt_id: aid,
    request_id: randomUUID(),
    message: "Tampilan soal perlu bantuan",
  };
  const h = await flow(request);
  assert.deepEqual(await flow(request), h);
  assert.equal(
    (await flow({ action: "help_list", attempt_id: aid })).length,
    1,
  );
  assert.equal((await flow({ ...request, request_id: randomUUID() })).id, h.id);
  await actor(3);
  await denied(
    () =>
      flow({
        action: "help",
        attempt_id: aid,
        request_id: randomUUID(),
        message: "Bantuan siswa lain",
      }),
    /AUTH/,
  );
  await denied(() => flow({ action: "help_list", attempt_id: aid }), /AUTH/);
  await actor(4);
  assert.equal(
    (await flow({ action: "help_list", exam_id: eid }))[0].can_resolve,
    true,
  );
  assert.equal(
    (await flow({ action: "signals", exam_id: eid }))[0].connection,
    "recent",
  );
  const resolution = {
    action: "resolve",
    id: h.id,
    request_id: randomUUID(),
    reason: "Silakan lanjut sesi; jawaban aman",
  };
  assert.equal((await flow(resolution)).resolved, true);
  assert.equal((await flow(resolution)).resolved, true);
  await denied(
    () =>
      flow({
        action: "extend",
        attempt_id: aid,
        version: 1,
        minutes: 5,
        request_id: randomUUID(),
        reason: "Gangguan listrik",
        confirmation: "TAMBAH WAKTU",
      }),
    /Admin/,
  );
  await actor(1);
  let ext = {
    action: "extend",
    attempt_id: aid,
    version: 1,
    minutes: 5,
    request_id: randomUUID(),
    reason: "Gangguan listrik di ruang ujian",
    confirmation: "TAMBAH WAKTU",
  };
  const extended = await flow(ext);
  assert.equal(
    Date.parse(extended.deadline_at) - Date.parse(started.deadline_at),
    300000,
  );
  assert.deepEqual(await flow(ext), extended);
  await denied(() => flow({ ...ext, request_id: randomUUID() }), /CONFLICT/);
  await denied(
    () => flow({ ...ext, version: 2, minutes: 60, request_id: randomUUID() }),
    /melampaui/,
  );
  await denied(
    () => flow({ ...ext, version: 2, minutes: -1, request_id: randomUUID() }),
    /1–60/,
  );
  await owner();
  assert.equal(
    (
      await db.query(
        "select count(*) n from private.attempt_overrides where attempt_id=$1 and action=$2",
        [aid, "extend"],
      )
    ).rows[0].n,
    1,
  );
  await db.query(
    "update private.attempt_presence set last_seen_at=clock_timestamp()-interval '1 minute' where attempt_id=$1",
    [aid],
  );
  await actor(1);
  assert.equal(
    (await flow({ action: "signals", exam_id: eid }))[0].connection,
    "stale",
  );
  await actor(2);
  const resumed = await rpc("attempt_command", {
    action: "resume",
    attempt_id: aid,
    client_id: client,
  });
  assert.equal(resumed.deadline_at, extended.deadline_at);
  assert.equal(
    (await flow({ action: "help_list", attempt_id: aid }))[0].resolution,
    resolution.reason,
  );
  await owner();
  await db.query(
    "update public.exam_attempts set started_at=clock_timestamp()-interval '1 hour',deadline_at=clock_timestamp()-interval '1 second' where id=$1",
    [aid],
  );
  await actor(1);
  await denied(
    () => flow({ ...ext, version: 2, request_id: randomUUID() }),
    /sebelum deadline/,
  );
  await owner();
  const grants = (
    await db.query(
      "select has_table_privilege('authenticated','private.exam_help_requests','select') direct,has_function_privilege('anon','public.workflow_command(jsonb)','execute') anon,has_function_privilege('authenticated','private.author_command_before_workflow(jsonb)','execute') bypass",
    )
  ).rows[0];
  assert.deepEqual(grants, { direct: false, anon: false, bypass: false });
  await db.exec("rollback");
  console.log(
    "PASS workflow: draft readiness, publication and old-path gate, invalidation, role/assignment isolation, import preflight, help/response, heartbeat, audited idempotent extension, version/deadline/window limits and private grants",
  );
} finally {
  await db.close();
}
