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
  await owner();
  const exam = "53000000-0000-4000-8000-000000000001";
  const times = (
    await db.query("select starts_at,ends_at from public.exams where id=$1", [
      exam,
    ])
  ).rows[0];
  await actor(1);
  const input = {
    action: "session_save",
    request_id: randomUUID(),
    exam_id: exam,
    name: "Sesi audit",
    starts_at: new Date(times.starts_at).toISOString(),
    ends_at: new Date(times.ends_at).toISOString(),
  };
  const created = await rpc(input);
  assert.ok(created.id);
  assert.deepEqual(await rpc(input), created);
  const updated = {
    ...input,
    request_id: randomUUID(),
    id: created.id,
    name: "Sesi diperbarui",
  };
  assert.equal((await rpc(updated)).id, created.id);
  await reject(() =>
    rpc({ ...updated, request_id: randomUUID(), id: randomUUID() }),
  );
  await command({ action: "session_delete", id: created.id });
  await reject(() => rpc({ ...updated, request_id: randomUUID() }));
  await actor(4);
  await reject(() => rpc({ ...input, request_id: randomUUID() }));
  await owner();
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.exam_sessions where id=$1",
        [created.id],
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "PASS rooms: session create/update/idempotency, missing/deleted session rejection, Admin-only; isolated database only",
  );
  await db.exec("rollback");
} finally {
  await db.close();
}
