import { stagingDatabase } from "./stage4-local-db.mjs";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { restoreRows } from "./restore-drill.mjs";
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
const rpc = async (name, input) =>
  (
    await db.query(`select public.${name}($1::jsonb) r`, [
      JSON.stringify(input),
    ])
  ).rows[0].r;
const deny = async (fn) => {
  await db.exec("savepoint denied");
  await assert.rejects(fn);
  await db.exec("rollback to savepoint denied;release savepoint denied");
};
const org = "6e143c55-7be5-4e6e-9f1a-8f8db429956a";
const input = {
  action: "record",
  request_id: randomUUID(),
  candidate_sha: "a".repeat(40),
  platform: "Windows",
  device_label: "Lab 01",
  seb_version: "Version observed by operator",
  checks: {
    login: true,
    questions: true,
    media: true,
    canvas: false,
    recovery: false,
    submit: true,
  },
  notes: "Canvas dan pemulihan perlu diuji ulang.",
  evidence_ref: "uat/lab-01/report.pdf",
};
try {
  await db.exec(
    readFileSync("supabase/tests/attempts.sql", "utf8").replace(
      /rollback;\s*$/,
      "commit;",
    ),
  );
  await db.exec("begin");
  await actor(1);
  const row = await rpc("advanced_command", input);
  assert.equal((await rpc("advanced_command", input)).id, row.id);
  let list = await rpc("advanced_command", { action: "list", page: 1 });
  assert.equal(list.ai_enabled, false);
  assert.equal(list.seb_enforced, false);
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0].checks.canvas, false);
  assert.equal(list.rows[0].input_hash, undefined);
  assert.equal(list.rows[0].request_id, undefined);
  await deny(() =>
    rpc("advanced_command", {
      ...input,
      notes: "Different content same request",
    }),
  );
  await deny(() =>
    rpc("advanced_command", {
      ...input,
      request_id: randomUUID(),
      checks: { ...input.checks, extra: true },
    }),
  );
  await deny(() =>
    rpc("advanced_command", {
      ...input,
      request_id: randomUUID(),
      checks: { ...input.checks, canvas: "true" },
    }),
  );
  await deny(() =>
    rpc("advanced_command", {
      ...input,
      request_id: randomUUID(),
      evidence_ref: "https://example.invalid?token=secret",
    }),
  );
  for (const n of [2, 4, 5]) {
    await actor(n);
    await deny(() => rpc("advanced_command", { action: "list" }));
    await deny(() =>
      rpc("advanced_command", { ...input, request_id: randomUUID() }),
    );
  }
  await db.exec("reset role");
  const grant = (
    await db.query(
      "select has_function_privilege('anon','public.advanced_command(jsonb)','execute') anon,has_table_privilege('authenticated','private.advanced_evaluations','select') direct",
    )
  ).rows[0];
  assert.deepEqual(grant, { anon: false, direct: false });
  await deny(() =>
    db.query("update private.advanced_evaluations set notes=$1 where id=$2", [
      "Changed record",
      row.id,
    ]),
  );
  await deny(() =>
    db.query("delete from private.advanced_evaluations where id=$1", [row.id]),
  );
  await db.query(
    "insert into public.organizations(id,name) values('99000000-0000-4000-8000-000000000011','Other evaluation org')",
  );
  await db.query(
    "insert into private.advanced_evaluations(organization_id,actor_id,request_id,input_hash,candidate_sha,platform,device_label,seb_version,checks,notes,evidence_ref) values('99000000-0000-4000-8000-000000000011',$1,$2,'hash',$3,'Windows','Other org lab','version',$4,'Other organization private note','uat/other/report.pdf')",
    [uid(1), randomUUID(), "b".repeat(40), JSON.stringify(input.checks)],
  );
  const ids = (
    await db.query(
      "select id from public.exam_attempts where finalized_at is not null and status<>'reset' and grading_revision>0 order by id limit 1",
    )
  ).rows;
  assert.equal(ids.length, 1);
  await actor(1);
  for (const format of ["pdf", "xlsx"]) {
    const command = {
      action: "create",
      request_id: randomUUID(),
      ids: [ids[0].id],
      kind: "exchange",
      format,
    };
    const job = await rpc("report_command", command);
    assert.equal((await rpc("report_command", command)).id, job.id);
    await actor(5);
    await deny(() =>
      rpc("report_command", { action: "status", job_id: job.id }),
    );
    await actor(1);
  }
  assert.equal((await rpc("advanced_command", { action: "list" })).total, 1);
  await db.exec("reset role");
  const captured = (
    await db.query(
      "select table_name as table,payload::text as record from private.backup_data($1)",
      [org],
    )
  ).rows;
  assert.equal(
    captured.filter((r) => r.table === "private.advanced_evaluations").length,
    1,
  );
  assert.ok(
    !JSON.stringify(captured).includes("Other organization private note"),
  );
  const before = (
    await db.query(
      "select to_jsonb(r)::text value from private.advanced_evaluations r where id=$1",
      [row.id],
    )
  ).rows[0].value;
  await db.exec("commit");
  await restoreRows(db, captured);
  assert.equal(
    (
      await db.query(
        "select to_jsonb(r)::text value from private.advanced_evaluations r where id=$1",
        [row.id],
      )
    ).rows[0].value,
    before,
  );
  console.log(
    "PASS advanced Admin scope, AI disabled/SEB optional, immutable observed results, idempotency/conflicts, strict checks, organization isolation, no direct table/anon grants, exchange report formats/ownership and exact isolated backup restore",
  );
} catch (e) {
  console.error(JSON.stringify({ message: e.message, where: e.where }));
  process.exitCode = 1;
} finally {
  await db.close();
}
