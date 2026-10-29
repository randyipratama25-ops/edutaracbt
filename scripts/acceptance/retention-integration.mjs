import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stagingDatabase } from '../stage4-local-db.mjs';
const db=await stagingDatabase();
try {
 await db.exec(readFileSync('supabase/tests/attempts.sql','utf8').replace(/rollback;\s*$/,'commit;'));
 const org='6e143c55-7be5-4e6e-9f1a-8f8db429956a';
 const backups=[];
 for(let i=0;i<4;i++) backups.push((await db.query("insert into private.work_jobs(organization_id,kind,dedupe,status,created_at) values($1,'backup',$2,'succeeded',now()-make_interval(days=>$3)) returning id",[org,'retention-fixture-'+i,200+i])).rows[0].id);
 const job=(await db.query("insert into private.work_jobs(organization_id,kind,dedupe,status,lease,lease_until) values($1,'retention','retention-test','running',gen_random_uuid(),now()+interval '5 minutes') returning id,lease",[org])).rows[0];
 const reserve=async id=>(await db.query('select public.retention_reserve($1) ok',[JSON.stringify({...job,backup_id:id})])).rows[0].ok;
 assert.equal(await reserve(backups[0]),false);
 assert.equal(await reserve(backups[1]),false);
 assert.equal(await reserve(backups[3]),true);
 assert.equal((await db.query('select payload from private.work_jobs where id=$1',[backups[3]])).rows[0].payload.outcome,'retention_pending');
 await db.exec('begin;set local role authenticated');
 await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:'03000000-0000-4000-8000-000000000001',session_id:'13000000-0000-4000-8000-000000000001',role:'authenticated'})]);
 await assert.rejects(()=>db.query('select public.system_command($1)',[JSON.stringify({action:'retry',id:backups[3]})]),/Hanya job/);
 await db.exec('rollback');
 const other=(await db.query("insert into private.work_jobs(organization_id,kind,dedupe,status,lease,lease_until) values($1,'retention','retention-other','running',gen_random_uuid(),now()+interval '5 minutes') returning id,lease",[org])).rows[0];
 assert.equal((await db.query('select public.retention_reserve($1) ok',[JSON.stringify({...other,backup_id:backups[3]})])).rows[0].ok,false);
 console.log('PASS retention preserves latest two, reserves old backups, rejects Admin retry and competing reservation');
} finally {await db.close();}
