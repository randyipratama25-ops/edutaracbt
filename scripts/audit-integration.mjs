import { stagingDatabase } from "./stage4-local-db.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const db = await stagingDatabase();
const org = "6e143c55-7be5-4e6e-9f1a-8f8db429956a";
try {
  await db.exec("begin");
  await db.exec(
    `insert into auth.users(id,email) select ('04000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'audit'||n||'@example.invalid' from generate_series(1,2)n;insert into auth.sessions(id,user_id) select ('14000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('04000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,2)n;insert into public.profiles(id,organization_id,username,full_name,role) select ('04000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${org}','audit_user_'||n,'Audit user '||n,case when n=1 then 'admin' else 'teacher' end from generate_series(1,2)n;insert into public.audit_logs(id,organization_id,action,target_type,created_at) select ('24000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${org}','AUDIT_ORDER_FIXTURE','profiles','2026-11-02T00:00:00Z' from generate_series(1,101)n;set local role authenticated;`,
  );
  const login = async (n) =>
    db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: `04000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        session_id: `14000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        role: "authenticated",
      }),
    ]);
  await login(1);
  const rows = [];
  for (let page = 1; page <= 3; page++) {
    const r = (
      await db.query("select public.system_command($1::jsonb) r", [
        JSON.stringify({
          action: "audit",
          page,
          search: "AUDIT_ORDER_FIXTURE",
        }),
      ])
    ).rows[0].r;
    assert.equal(r.total, 101);
    rows.push(...r.rows);
  }
  assert.equal(rows.length, 101);
  assert.equal(new Set(rows.map((r) => r.id)).size, 101);
  assert.deepEqual(
    rows.map((r) => r.id),
    [...rows.map((r) => r.id)].sort().reverse(),
  );
  const filtered = (
    await db.query("select public.system_command($1::jsonb) r", [
      JSON.stringify({
        action: "audit",
        from: "2026-11-02T00:00:00Z",
        until: "2026-11-02T00:00:00Z",
        search: "AUDIT_ORDER_FIXTURE",
      }),
    ])
  ).rows[0].r;
  assert.equal(filtered.total, 0);
  await login(2);
  await db.exec("savepoint denied");
  await assert.rejects(
    () => db.query('select public.system_command(\'{"action":"audit"}\')'),
    /AUTH/,
  );
  await db.exec("rollback to savepoint denied");
  await db.exec("reset role");
  const before = (
    await db.query(
      "select proacl::text,prosecdef,proconfig from pg_proc where oid='private.system_command(jsonb)'::regprocedure",
    )
  ).rows;
  await db.exec(
    readFileSync(
      "supabase/migrations/20261102144237_audit_stable_order.sql",
      "utf8",
    ),
  );
  const after = (
    await db.query(
      "select proacl::text,prosecdef,proconfig from pg_proc where oid='private.system_command(jsonb)'::regprocedure",
    )
  ).rows;
  assert.deepEqual(after, before);
  console.log(
    "PASS audit database:101 identical timestamps across3pages,no duplicate,ID DESC,exclusive upper bound,teacher denied,idempotent patch and privileges preserved",
  );
} finally {
  await db.close();
}
