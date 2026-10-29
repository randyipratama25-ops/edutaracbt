// Local PGlite only; no production connection or SQL execution path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stagingDatabase } from '../stage4-local-db.mjs';
import { assertAnswersPreserved } from './gate.mjs';
const db = await stagingDatabase();
async function inventory() {
  const result = await db.exec(readFileSync('scripts/release/protected-inventory.sql', 'utf8'));
  const rows = result.find(r => r.rows?.[0]?.inventory)?.rows[0].inventory;
  assert.ok(Array.isArray(rows), 'Read-only inventory must produce JSON rows');
  return rows;
}
try {
  await db.exec(readFileSync('supabase/tests/attempts.sql','utf8').replace(/rollback;\s*$/, 'commit;'));
  const live = await inventory();
  const newest = live.find(r => r.table === 'private.answer_revisions');
  assert.ok(newest, 'Fixture must contain real saved answer revisions');
  // A proposed historical restore lacks a revision now present in the live inventory.
  assert.throws(() => assertAnswersPreserved(live, live.filter(r => r !== newest)));
  // pg_cron facade in local PGlite: real production uses the extension.
  await db.exec("create function cron.unschedule(target bigint) returns boolean language sql as $$with removed as (delete from cron.job where jobid=target returning 1) select exists(select 1 from removed)$$");
  await db.exec(readFileSync('supabase/proposals/stage6-disable.sql','utf8'));
  const after = await inventory();
  const result = assertAnswersPreserved(live, after);
  assert.equal(result.additional_rows, 0);
  console.log('PASS isolated Stage 6 disable preserves protected attempt/answer/grade rows:', result.preserved);
  console.log('PASS proposed historical restore losing a saved revision is refused');
} finally {
  await db.close();
}
