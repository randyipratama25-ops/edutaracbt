import { stagingDatabase } from './stage4-local-db.mjs';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = await stagingDatabase();
try {
  await db.exec(readFileSync('supabase/tests/attempts.sql', 'utf8').replace(/rollback;\s*$/, ''));
  await db.exec('reset role;set local role authenticated');
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub:'03000000-0000-4000-8000-000000000002', session_id:'13000000-0000-4000-8000-000000000002', role:'authenticated',
  })]);
  const aid = (await db.query("select current_setting('test.attempt') id")).rows[0].id;
  const rpc = async input => (await db.query('select public.attempt_command($1::jsonb) dto', [JSON.stringify(input)])).rows[0].dto;
  const writer = { attempt_id:aid, client_id:'83000000-0000-4000-8000-000000000002' };
  const before = await rpc({ action:'resume', ...writer });
  const repeated = await rpc({ action:'submit', ...writer, epoch:3, request_id:randomUUID(), mode:'manual' });
  assert.equal(repeated.id, before.id);
  assert.equal(repeated.finalized_at, before.finalized_at);
  assert.equal(repeated.deadline_at, before.deadline_at);
  assert.equal(repeated.status, 'submitted');
  assert.deepEqual(repeated.questions, []);
  assert.deepEqual(repeated.answers, []);
  // Another student cannot obtain this attempt/receipt through resume.
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub:'03000000-0000-4000-8000-000000000003', session_id:'13000000-0000-4000-8000-000000000003', role:'authenticated',
  })]);
  await db.exec('savepoint forbidden');
  await assert.rejects(() => rpc({ action:'resume', ...writer }));
  await db.exec('rollback to savepoint forbidden;rollback');
  console.log('PASS lifecycle regression, stable finalization/deadline on repeated submit/resume, terminal payload privacy and cross-student receipt denial');
} finally { await db.close(); }
