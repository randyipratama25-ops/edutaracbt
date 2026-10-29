import { stagingDatabase } from "./stage4-local-db.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { restoreRows, verifyArtifact, byteHash } from "./restore-drill.mjs";
const db = await stagingDatabase();
const actor = async (n) => {
  await db.exec("reset role;set local role authenticated");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: `03000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      session_id: `13000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      role: "authenticated",
    }),
  ]);
};
const owner = () => db.exec("reset role");
const rpc = async (input, name = "system_command") =>
  (
    await db.query(`select public.${name}($1::jsonb) r`, [
      JSON.stringify(input),
    ])
  ).rows[0].r;
const reject = async (fn) => {
  await db.exec("savepoint denied");
  let e;
  try {
    await fn();
  } catch (err) {
    e = err;
  }
  await db.exec("rollback to savepoint denied;release savepoint denied");
  assert.ok(e, "operation must reject");
};
try {
  await db.exec("update private.worker_transport set public_anon_jwt='local-public-jwt-test-facade',full_worker_approved=true");
  await db.exec(
    readFileSync("supabase/tests/attempts.sql", "utf8").replace(
      /rollback;\s*$/,
      "",
    ),
  );
  console.log(
    "PASS Stage 6 schema and all prior attempt regression assertions",
  );
  await owner();
  await db.exec("set local role anon");
  const branding = (await db.query("select public.app_branding() value"))
    .rows[0].value;
  assert.equal(branding.name, "EDUTARA CBT");
  assert.ok(!("smtp_password" in branding));
  await reject(() => rpc({ action: "get" }));
  await owner();
  await actor(5);
  await reject(() => rpc({ action: "get" }));
  await actor(2);
  await reject(() => rpc({ action: "jobs" }));
  await actor(1);
  const config = await rpc({ action: "get" });
  assert.equal(config.secret_readback, false);
  const secret = "fake-SMTP-secret-for-local-tests";
  await rpc({ action: "secret", key: "smtp_password", value: secret });
  const publicView = await rpc({ action: "get" });
  assert.equal(publicView.secrets.smtp_password, true);
  assert.ok(!JSON.stringify(publicView).includes(secret));
  await owner();
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.audit_logs where action like $1",
        ["%" + secret + "%"],
      )
    ).rows[0].n,
    0,
  );
  await actor(1);
  await reject(() => rpc({ action: "save", version: 99, settings: config }));
  await owner();
  await reject(() => db.exec("update public.audit_logs set action='TAMPER'"));
  await reject(() => db.exec("delete from public.audit_logs"));
  const boundary = async (iso) =>
    (
      await db.query("select private.semester_due($1,'Asia/Jakarta') key", [
        iso,
      ])
    ).rows[0].key;
  assert.equal(await boundary("2026-06-30T16:29:59Z"), null);
  assert.equal(await boundary("2026-06-30T16:30:00Z"), "2026-H1");
  assert.equal(await boundary("2026-12-31T16:30:00Z"), "2026-H2");
  assert.equal(await boundary("2026-07-01T16:30:00Z"), null);
  await db.exec(
    "update private.app_settings set automation_enabled=true where organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a'",
  );
  await db.query("select private.scheduler_tick($1)", ["2026-12-31T16:30:00Z"]);
  await db.query("select private.scheduler_tick($1)", ["2026-12-31T16:30:00Z"]);
  assert.equal(
    (
      await db.query(
        "select count(*) n from private.work_jobs where kind='backup' and dedupe='semester:2026-H2'",
      )
    ).rows[0].n,
    1,
  );
  await owner();
  const subject = randomUUID(),
    exam = randomUUID();
  await db.query(
    "insert into public.subjects(id,organization_id,name) values($1,'6e143c55-7be5-4e6e-9f1a-8f8db429956a','Reminder fixture')",
    [subject],
  );
  await db.query(
    "insert into public.teacher_assignments(organization_id,teacher_id,class_id,subject_id) values('6e143c55-7be5-4e6e-9f1a-8f8db429956a','03000000-0000-4000-8000-000000000005','33000000-0000-4000-8000-000000000001',$1)",
    [subject],
  );
  await db.query(
    "insert into public.exams(id,organization_id,subject_id,title,starts_at,ends_at,duration_minutes,pin_hash,status) values($1,'6e143c55-7be5-4e6e-9f1a-8f8db429956a',$2,'Reminder fixture',now()+interval '2 days',now()+interval '2 days 1 hour',60,extensions.crypt('998877',extensions.gen_salt('bf')),'draft')",
    [exam, subject],
  );
  await db.query(
    "insert into public.exam_classes values('6e143c55-7be5-4e6e-9f1a-8f8db429956a',$1,'33000000-0000-4000-8000-000000000001')",
    [exam],
  );
  await db.query(
    "insert into public.exam_type_configs values($1,'PG',true,2,2,10)",
    [exam],
  );
  await db.exec(
    "insert into public.authoring_periods values('6e143c55-7be5-4e6e-9f1a-8f8db429956a',true,now()-interval '1 day',now()+interval '2 hours') on conflict(organization_id) do update set enabled=true,starts_at=excluded.starts_at,ends_at=excluded.ends_at;update auth.users set email='teacher-fixture@example.invalid',email_confirmed_at=now() where id='03000000-0000-4000-8000-000000000005';update private.app_settings set reminders_enabled=true where organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a';",
  );
  await db.exec(
    "select private.scheduler_tick((date_trunc('day',now() at time zone 'Asia/Jakarta')+interval '11 hours') at time zone 'Asia/Jakarta');select private.scheduler_tick((date_trunc('day',now() at time zone 'Asia/Jakarta')+interval '11 hours') at time zone 'Asia/Jakarta');",
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from private.work_jobs where kind='reminder'",
      )
    ).rows[0].n,
    1,
  );
  await db.exec(
    "update auth.users set email_confirmed_at=null where id='03000000-0000-4000-8000-000000000005';select private.scheduler_tick((date_trunc('day',now() at time zone 'Asia/Jakarta')+interval '13 hours') at time zone 'Asia/Jakarta');",
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from private.work_jobs where kind='reminder'",
      )
    ).rows[0].n,
    1,
  );
  await db.exec(
    "update auth.users set email_confirmed_at=now() where id='03000000-0000-4000-8000-000000000005';update public.exam_type_configs set max_questions=0;",
  );
  await db.exec(
    "select private.scheduler_tick((date_trunc('day',now() at time zone 'Asia/Jakarta')+interval '15 hours') at time zone 'Asia/Jakarta');",
  );
  assert.equal(
    (
      await db.query(
        "select count(*) n from private.work_jobs where kind='reminder'",
      )
    ).rows[0].n,
    1,
  );
  await db.exec(
    "update private.app_settings set reminders_enabled=false where organization_id='6e143c55-7be5-4e6e-9f1a-8f8db429956a';",
  );
  console.log(
    "PASS reminder verified-email/deficit gates and hourly outbox dedupe; no real SMTP used",
  );
  await actor(1);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS3kAAAAASUVORK5CYII=",
    "base64",
  );
  await owner();
  await db.query(
    "update public.media_assets set byte_size=$1,sha256=$2 where id='a3000000-0000-4000-8000-000000000001'",
    [png.length, byteHash(png)],
  );
  await actor(1);
  const request = { action: "backup", request_id: randomUUID() };
  const job = await rpc(request);
  assert.equal((await rpc(request)).id, job.id);
  await owner();
  const token = (
    await db.query(
      "select body from net.requests where body->>'id'=$1 order by id desc limit 1",
      [job.id],
    )
  ).rows[0].body;
  await db.exec("set local role service_role");
  await reject(() =>
    rpc({ action: "claim", id: job.id, nonce: randomUUID() }, "worker_command"),
  );
  const claimed = await rpc(
    { action: "claim", id: job.id, nonce: token.nonce },
    "worker_command",
  );
  assert.ok(claimed.lease);
  const data = await rpc(
    { action: "capture", id: job.id, lease: claimed.lease },
    "worker_command",
  );
  assert.ok(data.rows > 0);
  await owner();
  const captured = (
    await db.query(
      "select ordinal,table_name as table,payload as record from private.backup_rows where job_id=$1 order by ordinal",
      [job.id],
    )
  ).rows;
  assert.ok(!captured.some((r) => r.table === "private.secret_refs"));
  assert.ok(!JSON.stringify(captured).includes(secret));
  assert.ok(captured.some((r) => r.table === "auth.identities_safe"));
  const root = "/tmp/stage6-backup-artifact-" + randomUUID();
  mkdirSync(root, { mode: 0o700 });
  mkdirSync(root + "/data");
  mkdirSync(root + "/objects");
  const dataBytes = Buffer.from(JSON.stringify(captured));
  writeFileSync(root + "/data/000001.json", dataBytes, { mode: 0o600 });
  writeFileSync(root + "/objects/000001.bin", png, { mode: 0o600 });
  const prefix = "6e143c55-7be5-4e6e-9f1a-8f8db429956a/" + job.id + "/";
  const manifest = {
    organization_id: "6e143c55-7be5-4e6e-9f1a-8f8db429956a",
    job_id: job.id,
    rows: captured.length,
    objects: 1,
    parts: [
      {
        path: prefix + "data/000001.json",
        bytes: dataBytes.length,
        sha256: byteHash(dataBytes),
        kind: "data",
      },
      {
        path: prefix + "objects/000001.bin",
        bytes: png.length,
        sha256: byteHash(png),
        kind: "object",
        metadata: { source_path: "fixture-source.png", bucket: "exam-media" },
      },
    ],
  };
  const artifact = await verifyArtifact(root, manifest);
  assert.equal(byteHash(artifact.objects[0].bytes), byteHash(png));
  writeFileSync(root + "/objects/000001.bin", Buffer.from("corrupted"));
  await assert.rejects(() => verifyArtifact(root, manifest));
  writeFileSync(root + "/objects/000001.bin", png);
  console.log(
    "PASS media bytes/checksum restore and corrupted artifact rejection",
  );
  await db.exec("rollback");
  // Restore in a second fresh isolated database. No production database connection exists here.
  const restored = await stagingDatabase();
  try {
    const report = await restoreRows(restored, captured);
    for (const table of new Set(
      captured.map((r) => r.table).filter((t) => t !== "auth.identities_safe"),
    )) {
      const actual = (
        await restored.query(`select to_jsonb(r) value from ${table} r`)
      ).rows
        .map((r) => JSON.stringify(r.value))
        .sort();
      const expected = captured
        .filter((r) => r.table === table)
        .map((r) => JSON.stringify(r.record))
        .sort();
      assert.deepEqual(actual, expected, "restored exact records: " + table);
    }
    console.log(
      "PASS isolated restore exact application table parity",
      JSON.stringify(report),
    );
  } finally {
    await restored.close();
  }
  console.log(
    "PASS Admin scope, secret no-readback/no-audit leakage, immutable audit, semester timezone boundaries, cron/backup idempotency, nonce auth and Auth credential exclusion",
  );
} catch (e) {
  console.error(e.message, e.query?.slice(0, 300), e.params);
  process.exitCode = 1;
} finally {
  await db.close();
}
