import { stagingDatabase } from "./stage4-local-db.mjs";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = await stagingDatabase();
const uid = "03000000-0000-4000-8000-000000000002",
  session = "13000000-0000-4000-8000-000000000002",
  client = "83000000-0000-4000-8000-000000000001";
const login = async () => {
  await db.exec("reset role;set local role authenticated");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: uid, session_id: session, role: "authenticated" }),
  ]);
};
const rpc = async (input) =>
  (
    await db.query("select public.attempt_command($1::jsonb) r", [
      JSON.stringify(input),
    ])
  ).rows[0].r;
try {
  let fixture = readFileSync("supabase/tests/attempts.sql", "utf8");
  fixture = fixture
    .slice(0, fixture.indexOf("create function pg_temp.assert_test"))
    .replace(
      '"distractors": [], "type": "JODOH"',
      '"distractors": ["WrongAlternative"], "type": "JODOH"',
    );
  await db.exec(fixture);
  await login();
  const started = await rpc({
    action: "start",
    exam_id: "53000000-0000-4000-8000-000000000001",
    pin: "887766",
    client_id: client,
  });
  const matching = started.questions.find((q) => q.payload.type === "JODOH");
  assert(matching.payload.choices.includes("WrongAlternative"));
  for (const q of started.questions)
    for (const key of [
      "key",
      "rubric",
      "rubricCriteria",
      "explanation",
      "keywords",
      "distractors",
    ])
      assert(!(key in q.payload), key);
  await db.exec("reset role");
  const snapshots = (
    await db.query(
      "select student_payload,grading_payload from private.attempt_questions where attempt_id=$1 order by position",
      [started.id],
    )
  ).rows;
  assert(snapshots.every((r) => !("distractors" in r.student_payload)));
  assert(
    snapshots.some((r) =>
      r.grading_payload.distractors?.includes("WrongAlternative"),
    ),
  );
  // Simulate an immutable snapshot captured before the fix, entirely inside this test database.
  const definition = (
    await db.query(
      "select pg_get_functiondef('private.attempt_command_before_workflow(jsonb)'::regprocedure) d",
    )
  ).rows[0].d;
  await db.exec(definition.replace("'keywords','distractors'", "'keywords'"));
  await db.exec(
    "insert into public.questions(id,organization_id,exam_id,type,points) values('63000000-0000-4000-8000-000000000009','6e143c55-7be5-4e6e-9f1a-8f8db429956a','53000000-0000-4000-8000-000000000002','PG',10);insert into public.question_versions(question_id,version,payload) select '63000000-0000-4000-8000-000000000009',1,payload from public.question_versions where question_id='63000000-0000-4000-8000-000000000001' and version=1;",
  );
  await login();
  const legacy = await rpc({
    action: "start",
    exam_id: "53000000-0000-4000-8000-000000000002",
    pin: "887766",
    client_id: client,
  });
  await db.exec("reset role");
  await db.exec(definition);
  const frozen = (
    await db.query(
      "select student_payload,grading_payload from private.attempt_questions where attempt_id=$1",
      [legacy.id],
    )
  ).rows;
  assert("distractors" in frozen[0].student_payload);
  await login();
  const resumed = await rpc({
    action: "resume",
    attempt_id: legacy.id,
    client_id: client,
  });
  assert(!("distractors" in resumed.questions[0].payload));
  assert.equal(resumed.deadline_at, legacy.deadline_at);
  assert.equal(resumed.epoch, legacy.epoch);
  await db.exec("reset role");
  assert.deepEqual(
    (
      await db.query(
        "select student_payload,grading_payload from private.attempt_questions where attempt_id=$1",
        [legacy.id],
      )
    ).rows,
    frozen,
  );
  await db.exec("rollback");
  console.log(
    "PASS new/legacy student payload privacy, matching choices retained, immutable grading/snapshot bytes preserved, unchanged deadline/epoch",
  );
} finally {
  await db.close();
}
